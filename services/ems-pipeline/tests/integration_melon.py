"""Run explicitly against an EMPTY isolated database: python tests/integration_melon.py."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ems_pipeline import melon
from ems_pipeline.tidal import CatalogRequestPaused


GENRES = [{"code": f"GN0{i}00", "name": f"Genre {i}"} for i in range(1, 9)]
MIGRATIONS = Path(__file__).resolve().parents[3] / "apps/web/src/lib/db/migrations"


def row(db, job_id):
    return db.execute("SELECT * FROM ems_melon_jobs WHERE id=%s", (job_id,)).fetchone()


def new_job(db, *, index=0, start=1, genres=GENRES, status="failed", count=0, batch=0):
    run = db.execute("""INSERT INTO ems_ingest_runs(run_type,status,snapshot_id)
                      VALUES ('melon_genres',%s,'isolated-melon-test') RETURNING id""", (status,)).fetchone()
    db.execute("""INSERT INTO ems_melon_jobs(id,status,genre_codes,genre_index,next_start_index,
                   last_page_first_song_id,discovered_count,staged_count,batch_discovered_count)
                   VALUES (%s,%s,%s,%s,%s,'999',%s,%s,%s)""",
               (run["id"], status, Jsonb(genres) if genres else None, index, start, count, count, batch))
    return run["id"]


def main():
    with psycopg.connect(os.environ["MELON_TEST_DATABASE_URL"], row_factory=dict_row, autocommit=True) as db:
        assert db.execute("SELECT to_regclass('ems_melon_jobs') AS name").fetchone()["name"] is None, "Requires empty test DB"
        for path in sorted(MIGRATIONS.glob("*.sql")):
            if not path.name.endswith(".down.sql") and path.name[:3] < "032":
                db.execute(path.read_text(encoding="utf-8"))
        legacy = new_job(db, index=3, start=151, count=25, batch=100)
        finished = new_job(db, index=8)
        current = new_job(db, status="running")
        undiscovered = new_job(db, genres=None)
        before = row(db, legacy)
        up = (MIGRATIONS / "032_melon_genre_checkpoints.sql").read_text(encoding="utf-8")
        down = (MIGRATIONS / "032_melon_genre_checkpoints.down.sql").read_text(encoding="utf-8")
        for iteration in range(2):
            db.execute(up)
            migrated = row(db, legacy)
            assert {k: v for k, v in migrated.items() if k != "genre_checkpoints"} == before
            assert migrated["genre_checkpoints"]["GN0400"] == {
                "nextStartIndex": 151, "lastPageFirstSongId": "999", "completed": False}
            assert all(migrated["genre_checkpoints"][g["code"]]["completed"] for g in GENRES[:3])
            assert all(c["completed"] for c in row(db, finished)["genre_checkpoints"].values())
            assert row(db, undiscovered)["genre_checkpoints"] == {}
            if iteration == 0:
                db.execute(down)
        print("PASS migration 001-032 / down-reapply / legacy ID, counts, cursors preserved")

        for index in range(8):
            songs = [melon.MelonSong(str(100 + index * 5 + n), "Title", "Artist", "Album") for n in range(5)]
            state = row(db, current)
            assert state["genre_index"] == index and state["next_start_index"] == 1
            melon._stage_page(db, str(current), GENRES[index], 1, songs)
            assert row(db, current)["batch_discovered_count"] == 5
            db.execute("UPDATE ems_melon_jobs SET batch_discovered_count=0 WHERE id=%s", (current,))
        state = row(db, current)
        assert (state["discovered_count"], state["staged_count"], state["genre_index"], state["next_start_index"]) == (40, 40, 0, 6)
        assert db.execute("SELECT count(DISTINCT genre_code) AS n FROM ems_melon_track_genres").fetchone()["n"] == 8
        assert db.execute("SELECT count(*) AS n FROM ems_ingest_candidates WHERE run_id=%s", (current,)).fetchone()["n"] == 40
        try:
            melon._stage_page(db, str(current), GENRES[0], 6,
                              [melon.MelonSong(str(100+n), "Title", "Artist", None) for n in range(5)])
            raise AssertionError("Repeated page accepted")
        except ValueError as error:
            assert str(error) == "melon_pagination_repeated"
        assert row(db, current) == state
        db.execute("UPDATE ems_melon_jobs SET status='paused' WHERE id=%s", (current,))
        paused = row(db, current)
        try:
            melon._stage_page(db, str(current), GENRES[0], 6,
                              [melon.MelonSong(str(200+n), "Title", "Artist", None) for n in range(5)])
            raise AssertionError("Paused job committed")
        except CatalogRequestPaused:
            pass
        assert row(db, current) == paused
        assert db.execute("SELECT count(*) AS n FROM ems_melon_tracks WHERE song_id >= '200'").fetchone()["n"] == 0
        assert db.execute("SELECT count(*) AS n FROM ems_ingest_candidates WHERE run_id=%s", (current,)).fetchone()["n"] == 40
        print("PASS real staging: eight genres, 40 candidates, cursor resume, repeated-page rejection, paused rollback")

        # Exercise the complete worker's batch boundary with DB queries; external providers are isolated.
        requests = []
        class FakeMelon:
            def __init__(self, *args, **kwargs):
                pass
            def get_page(self, code, start, *, page_size=50):
                requests.append((code, start, page_size))
                return "<table>" + "".join(
                    f"<tr><td><input name='input_check' value='{300+n}'></td>"
                    "<td class='rank01'>Title</td><td class='rank02'>Artist</td></tr>" for n in range(5)
                ) + "</table>"
        class FakeTidal:
            def __init__(self, *args, **kwargs):
                pass
            def wait(self, seconds):
                pass
        def resolve(*args, **kwargs):
            db.execute("UPDATE ems_ingest_candidates SET resolver_status='not_found' WHERE run_id=%s", (current,))
            return {"matched": 0}
        db.execute("UPDATE ems_melon_jobs SET status='running',batch_discovered_count=100 WHERE id=%s", (current,))
        with patch.dict(os.environ, {"TIDAL_CLIENT_ID": "test", "TIDAL_CLIENT_SECRET": "test"}), \
             patch.object(melon, "MelonClient", FakeMelon), patch.object(melon, "TidalCatalogClient", FakeTidal), \
             patch.object(melon, "run_worker", resolve):
            melon.process_job(db, str(current))
            assert not requests, "Legacy batch must drain without discovering another page"
            state = row(db, current)
            assert state["batch_discovered_count"] == 0 and state["phase"] == "batch_wait"
            delay = db.execute("SELECT EXTRACT(EPOCH FROM next_batch_at-now()) AS delay FROM ems_melon_jobs WHERE id=%s", (current,)).fetchone()["delay"]
            assert 55 <= delay <= 60
            melon.process_job(db, str(current))
            assert not requests, "Next batch cannot bypass the 60-second wait"
            db.execute("UPDATE ems_melon_jobs SET next_batch_at=now()-interval '1 second' WHERE id=%s", (current,))
            melon.process_job(db, str(current))
            assert requests == [("GN0100", 6, 5)]
            state = row(db, current)
            assert state["discovered_count"] == 45 and state["genre_index"] == 1
            assert state["genre_checkpoints"]["GN0100"]["nextStartIndex"] == 11
        print("PASS full worker: legacy backlog drains, 60-second wait enforced, one five-track page rotates genre")
        melon._stage_page(db, str(current), GENRES[1], 6,
                          [melon.MelonSong(str(300+n), "Title", "Artist", None) for n in range(5)])
        state = row(db, current)
        assert (state["discovered_count"], state["staged_count"]) == (50, 45)
        assert db.execute("SELECT count(*) AS n FROM ems_melon_tracks").fetchone()["n"] == 45
        assert db.execute("SELECT count(*) AS n FROM ems_melon_track_genres").fetchone()["n"] == 50
        assert db.execute("SELECT count(*) AS n FROM ems_ingest_candidates WHERE run_id=%s", (current,)).fetchone()["n"] == 45
        print("PASS same songs in different genres: source/candidate deduplication, all genre relations retained")


if __name__ == "__main__":
    main()
