from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx
from bs4 import BeautifulSoup
from psycopg.types.json import Jsonb

from .embedding import embed_ems_batch, embed_remote
from .importer import stage_candidates
from .select import Candidate
from .tidal import CatalogRequestPaused, TidalCatalogClient, parse_retry_after
from .worker import run_worker


BASE_URL = "https://www.melon.com"
GENRE_RE = re.compile(r"^/genre/song_list\.htm\?gnrCode=(GN0[1-8]00)$")
SONG_ID_RE = re.compile(r"^[0-9]+$")
PAGE_SIZE = 50
BATCH_SIZE = 100
BATCH_INTERVAL_SECONDS = 60
_tidal_token_cache: tuple[str, float] | None = None


@dataclass(frozen=True)
class MelonSong:
    song_id: str
    title: str
    artist: str
    album: str | None

    @property
    def source_url(self) -> str:
        return f"{BASE_URL}/song/detail.htm?songId={self.song_id}"


def parse_genres(html: str) -> list[dict[str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    genres: dict[str, str] = {}
    for link in soup.select("a.link_tab[href]"):
        match = GENRE_RE.fullmatch(str(link.get("href", "")))
        if match:
            name = link.get_text(" ", strip=True)
            if name:
                genres[match.group(1)] = name
    if len(genres) != 8:
        raise ValueError("melon_genre_structure_changed")
    return [{"code": code, "name": name} for code, name in sorted(genres.items())]


def parse_songs(html: str) -> list[MelonSong]:
    soup = BeautifulSoup(html, "html.parser")
    songs: list[MelonSong] = []
    for box in soup.select("input[name='input_check'][value]"):
        song_id = str(box.get("value", ""))
        if not SONG_ID_RE.fullmatch(song_id):
            continue
        row = box.find_parent("tr")
        if row is None:
            continue
        title_box = row.select_one(".rank01")
        artist_box = row.select_one(".rank02")
        album_box = row.select_one(".rank03")
        if title_box is None or artist_box is None:
            raise ValueError("melon_song_structure_changed")
        title = title_box.get_text(" ", strip=True)
        artist_links = artist_box.find_all("a", recursive=False)
        artist = ", ".join(link.get_text(" ", strip=True) for link in artist_links)
        if not artist:
            artist = artist_box.get_text(" ", strip=True)
        album = album_box.get_text(" ", strip=True) if album_box else None
        if not title or not artist:
            raise ValueError("melon_song_structure_changed")
        songs.append(MelonSong(song_id, title, artist, album or None))
    if not songs:
        # An empty list may be the natural end of pagination; callers also check page markers.
        return []
    return songs


class MelonClient:
    def __init__(self, http_client: httpx.Client, *, should_continue: Callable[[], bool],
                 on_request: Callable[[], None], interval_seconds: float = 3.0):
        self.http_client = http_client
        self.should_continue = should_continue
        self.on_request = on_request
        self.interval_seconds = max(3.0, interval_seconds)
        self.last_request_at = 0.0

    def wait(self, seconds: float) -> None:
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if not self.should_continue():
                raise CatalogRequestPaused("melon job paused")
            time.sleep(max(0.0, min(1.0, until - time.monotonic())))

    def get_page(self, genre_code: str, start_index: int) -> str:
        if not re.fullmatch(r"GN0[1-8]00", genre_code) or start_index < 1:
            raise ValueError("invalid_melon_page")
        if start_index == 1:
            path = "/genre/song_list.htm"
            params: dict[str, str | int] = {"gnrCode": genre_code}
        else:
            path = "/genre/song_listPaging.htm"
            params = {"startIndex": start_index, "pageSize": PAGE_SIZE, "gnrCode": genre_code,
                      "dtlGnrCode": "", "orderBy": "NEW", "steadyYn": "N"}
        for attempt in range(3):
            self.wait(max(0.0, self.interval_seconds - (time.monotonic() - self.last_request_at)))
            self.on_request()
            self.last_request_at = time.monotonic()
            response = self.http_client.get(
                f"{BASE_URL}{path}", params=params,
                headers={"User-Agent": "Mozilla/5.0 (compatible; MRMS-Melon-Metadata/1.0)",
                         "Referer": f"{BASE_URL}/genre/song_list.htm?gnrCode={genre_code}"},
            )
            if response.status_code == 429:
                if attempt == 2:
                    raise ValueError("melon_rate_limited")
                self.wait(max(60, parse_retry_after(response.headers.get("Retry-After")) or 60))
                continue
            if response.status_code in (401, 403):
                raise ValueError("melon_access_blocked")
            response.raise_for_status()
            if "melon.com" not in str(response.url):
                raise ValueError("melon_redirect_blocked")
            if not any(marker in response.text for marker in ("input_check", "songList", "service_list_song", "d_song_list")):
                raise ValueError("melon_page_structure_changed")
            return response.text
        raise ValueError("melon_rate_limited")


def _status(connection: Any, job_id: str) -> str:
    row = connection.execute("SELECT status FROM ems_melon_jobs WHERE id = %s", (job_id,)).fetchone()
    return str(row["status"]) if row else "missing"


def _phase(connection: Any, job_id: str, phase: str) -> None:
    changed = connection.execute(
        """UPDATE ems_melon_jobs SET status = 'running', phase = %s, heartbeat_at = now(), updated_at = now()
             WHERE id = %s AND status IN ('pending', 'running') RETURNING id""", (phase, job_id),
    ).fetchone()
    if not changed:
        raise CatalogRequestPaused("melon job paused")
    connection.execute(
        """UPDATE ems_ingest_runs SET status = 'running', heartbeat_at = now(),
                  started_at = COALESCE(started_at, now()) WHERE id = %s""", (job_id,),
    )
    connection.execute(
        """UPDATE ems_source_routines SET status = 'resolving', updated_at = now()
             WHERE source_key = 'melon_genres' AND current_run_id = %s""", (job_id,),
    )


def _progress(connection: Any, job_id: str) -> None:
    connection.execute(
        """UPDATE ems_ingest_runs SET requested_count = counts.total, matched_count = counts.matched,
                  heartbeat_at = now()
             FROM (SELECT count(*)::int AS total,
                          count(*) FILTER (WHERE resolver_status = 'matched')::int AS matched
                     FROM ems_ingest_candidates WHERE run_id = %s) counts
            WHERE id = %s""", (job_id, job_id),
    )
    connection.execute(
        "UPDATE ems_melon_jobs SET heartbeat_at = now(), updated_at = now() WHERE id = %s", (job_id,),
    )


def _stage_page(connection: Any, job_id: str, genre: dict[str, str], start_index: int,
                songs: list[MelonSong]) -> None:
    if len(songs) > PAGE_SIZE:
        raise ValueError("melon_page_size_changed")
    previous = connection.execute(
        "SELECT last_page_first_song_id FROM ems_melon_jobs WHERE id = %s", (job_id,),
    ).fetchone()
    if songs and start_index > 1 and previous["last_page_first_song_id"] == songs[0].song_id:
        raise ValueError("melon_pagination_repeated")
    candidate_keys = [f"melon:{song.song_id}" for song in songs]
    existing = connection.execute(
        """SELECT source_id FROM ems_track_sources WHERE source_type = 'melon'
             AND source_id = ANY(%s)""", ([song.song_id for song in songs],),
    ).fetchall()
    linked = {str(row["source_id"]) for row in existing}
    already_staged = connection.execute(
        """SELECT candidate_key FROM ems_ingest_candidates WHERE run_id = %s
             AND candidate_key = ANY(%s)""", (job_id, candidate_keys),
    ).fetchall()
    staged_keys = {str(row["candidate_key"]) for row in already_staged}
    candidates = [Candidate(
        candidate_key=f"melon:{song.song_id}", recording_mbid=None, isrc=None,
        title=song.title, artist=song.artist, album=song.album,
        duration_ms=None, release_date=None, artist_region="KR",
        selection_bucket="melon", selection_score=0.8,
    ) for song in songs if song.song_id not in linked and f"melon:{song.song_id}" not in staged_keys]
    sequence_start = connection.execute(
        "SELECT COALESCE(max(sequence_no), -1) + 1 AS next FROM ems_ingest_candidates WHERE run_id = %s",
        (job_id,),
    ).fetchone()["next"]
    with connection.transaction():
        for song in songs:
            connection.execute(
                """INSERT INTO ems_melon_tracks (song_id, title, artist, album, source_url)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (song_id) DO UPDATE SET title = EXCLUDED.title, artist = EXCLUDED.artist,
                     album = EXCLUDED.album, source_url = EXCLUDED.source_url, last_seen_at = now()""",
                (song.song_id, song.title, song.artist, song.album, song.source_url),
            )
            connection.execute(
                """INSERT INTO ems_melon_track_genres (song_id, genre_code, genre_name)
                   VALUES (%s, %s, %s)
                   ON CONFLICT (song_id, genre_code) DO UPDATE
                     SET genre_name = EXCLUDED.genre_name, last_seen_at = now()""",
                (song.song_id, genre["code"], genre["name"]),
            )
            if song.song_id in linked:
                connection.execute(
                    """UPDATE ems_track_sources SET
                          metadata = jsonb_build_object('source_url', %s, 'title', %s,
                            'artist', %s, 'album', %s,
                            'genres', (SELECT jsonb_agg(jsonb_build_object('code', g.genre_code, 'name', g.genre_name))
                                         FROM ems_melon_track_genres g WHERE g.song_id = %s)),
                          last_seen_at = now()
                        WHERE source_type = 'melon' AND source_id = %s""",
                    (song.source_url, song.title, song.artist, song.album, song.song_id, song.song_id),
                )
        stage_candidates(connection, job_id, candidates, sequence_start=int(sequence_start))
        if len(songs) < PAGE_SIZE:
            connection.execute(
                """UPDATE ems_melon_jobs SET genre_index = genre_index + 1, next_start_index = 1,
                          last_page_first_song_id = NULL, next_batch_at = NULL,
                          batch_discovered_count = batch_discovered_count + %s,
                          discovered_count = discovered_count + %s,
                          staged_count = staged_count + %s, heartbeat_at = now(), updated_at = now()
                    WHERE id = %s AND status = 'running'""", (len(songs), len(songs), len(candidates), job_id),
            )
        else:
            connection.execute(
                """UPDATE ems_melon_jobs SET next_start_index = %s, last_page_first_song_id = %s,
                          next_batch_at = NULL, batch_discovered_count = batch_discovered_count + %s,
                          discovered_count = discovered_count + %s, staged_count = staged_count + %s,
                          heartbeat_at = now(), updated_at = now()
                    WHERE id = %s AND status = 'running'""",
                (start_index + PAGE_SIZE, songs[0].song_id, len(songs), len(songs), len(candidates), job_id),
            )
    _progress(connection, job_id)


def _finish(connection: Any, job_id: str, status: str, error_code: str | None = None) -> None:
    with connection.transaction():
        connection.execute(
            """UPDATE ems_melon_jobs SET status = %s, phase = 'finished', error_code = %s,
                      finished_at = now(), heartbeat_at = now(), updated_at = now()
                WHERE id = %s AND status IN ('pending', 'running')""", (status, error_code, job_id),
        )
        connection.execute(
            """UPDATE ems_ingest_runs SET status = %s, error_code = %s,
                      finished_at = now(), heartbeat_at = now()
                WHERE id = %s AND status IN ('pending', 'running')""", (status, error_code, job_id),
        )
        connection.execute(
            """UPDATE ems_source_routines SET status = CASE WHEN %s = 'completed' THEN 'idle' ELSE 'failed' END,
                      last_checked_at = now(), last_success_at = CASE WHEN %s = 'completed' THEN now() ELSE last_success_at END,
                      last_candidate_count = (SELECT staged_count FROM ems_melon_jobs WHERE id = %s),
                      next_check_at = now() + make_interval(secs => CASE WHEN %s = 'completed' THEN check_interval_seconds ELSE 21600 END),
                      error_code = %s, updated_at = now()
                WHERE source_key = 'melon_genres' AND current_run_id = %s""",
            (status, status, job_id, status, error_code, job_id),
        )
    _progress(connection, job_id)


def process_job(connection: Any, job_id: str) -> None:
    global _tidal_token_cache
    def can_continue() -> bool:
        return _status(connection, job_id) in {"pending", "running"}

    def record_request() -> None:
        interval = max(3.0, float(os.environ.get("MELON_MIN_REQUEST_INTERVAL_SECONDS", "3")))
        while True:
            current = connection.execute(
                """SELECT GREATEST(0, EXTRACT(EPOCH FROM last_melon_request_at
                          + make_interval(secs => %s) - now())) AS wait_seconds
                     FROM ems_melon_jobs WHERE id = %s""", (interval, job_id),
            ).fetchone()
            delay = float(current["wait_seconds"] or 0) if current else 0
            if delay <= 0:
                break
            melon.wait(min(delay, 1.0))
        row = connection.execute(
            """UPDATE ems_melon_jobs SET request_count = request_count + 1,
                      last_melon_request_at = now(), heartbeat_at = now(), updated_at = now()
                WHERE id = %s AND status IN ('pending', 'running') RETURNING id""", (job_id,),
        ).fetchone()
        if not row:
            raise CatalogRequestPaused("melon job paused")

    with httpx.Client(timeout=30, follow_redirects=False) as melon_http, httpx.Client(timeout=30) as tidal_http:
        melon = MelonClient(melon_http, should_continue=can_continue, on_request=record_request,
                            interval_seconds=float(os.environ.get("MELON_MIN_REQUEST_INTERVAL_SECONDS", "3")))
        tidal = TidalCatalogClient(
            os.environ["TIDAL_CLIENT_ID"].strip(), os.environ["TIDAL_CLIENT_SECRET"].strip(),
            request_budget=None, http_client=tidal_http,
            min_request_interval_seconds=max(0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5"))),
            should_continue=can_continue,
        )
        if _tidal_token_cache and time.time() < _tidal_token_cache[1] - 30:
            tidal._token, tidal._token_expires_at = _tidal_token_cache
        job = connection.execute("SELECT genre_codes FROM ems_melon_jobs WHERE id = %s", (job_id,)).fetchone()
        if job["genre_codes"] is None:
            _phase(connection, job_id, "discovering")
            genres = parse_genres(melon.get_page("GN0100", 1))
            connection.execute(
                "UPDATE ems_melon_jobs SET genre_codes = %s, updated_at = now() WHERE id = %s AND status = 'running'",
                (Jsonb(genres), job_id),
            )
        job = connection.execute(
            """SELECT genre_codes, genre_index, next_start_index, batch_discovered_count,
                      next_batch_at > now() AS batch_waiting,
                      next_tidal_retry_at > now() AS tidal_rate_limited
                 FROM ems_melon_jobs WHERE id = %s""", (job_id,),
        ).fetchone()
        genres = job["genre_codes"]
        index = int(job["genre_index"])
        if job["batch_waiting"]:
            _phase(connection, job_id, "batch_wait")
            return
        batch_count = int(job["batch_discovered_count"])
        batch_closed = batch_count >= BATCH_SIZE or (batch_count > 0 and int(job["next_start_index"]) == 1)
        if index < len(genres) and not batch_closed:
            genre = genres[index]
            start_index = int(job["next_start_index"])
            _phase(connection, job_id, "discovering")
            songs = parse_songs(melon.get_page(genre["code"], start_index))
            if not songs and start_index == 1:
                raise ValueError("melon_song_structure_changed")
            _stage_page(connection, job_id, genre, start_index, songs)
        rate_limited_now = False
        if not job["tidal_rate_limited"]:
            ready = connection.execute(
                """SELECT 1 FROM ems_ingest_candidates WHERE run_id = %s
                    AND resolver_status IN ('pending', 'retryable', 'resolving')
                    AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                    AND (lease_expires_at IS NULL OR lease_expires_at <= now()) LIMIT 1""",
                (job_id,),
            ).fetchone()
            if ready:
                _phase(connection, job_id, "resolving")
                tidal.wait(max(0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5"))))
                recent = None

                def remember(result: Any) -> None:
                    nonlocal recent
                    global _tidal_token_cache
                    recent = result
                    if tidal._token:
                        _tidal_token_cache = (tidal._token, tidal._token_expires_at)

                counts = run_worker(connection, job_id, tidal, batch_size=1, max_batches=1, on_result=remember)
                _progress(connection, job_id)
                if recent and recent.error_code == "rate_limited":
                    rate_limited_now = True
                    connection.execute(
                        """UPDATE ems_melon_jobs SET phase = 'rate_limited',
                                  next_tidal_retry_at = now() + make_interval(secs => %s), updated_at = now()
                            WHERE id = %s""", (max(1, recent.retry_after_seconds or 60), job_id),
                    )
                if counts.get("matched"):
                    _phase(connection, job_id, "embedding")
                    try:
                        embed_ems_batch(
                            connection,
                            lambda texts: embed_remote(texts, os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000")),
                            limit=16,
                        )
                    except (httpx.HTTPError, ValueError):
                        _phase(connection, job_id, "embedding_retry")
                        return
        refreshed = connection.execute(
            """SELECT genre_codes, genre_index, next_start_index, batch_discovered_count
                 FROM ems_melon_jobs WHERE id = %s""", (job_id,),
        ).fetchone()
        remaining = connection.execute(
            """SELECT count(*)::int AS count FROM ems_ingest_candidates
                WHERE run_id = %s AND resolver_status IN ('pending', 'resolving', 'retryable')""",
            (job_id,),
        ).fetchone()["count"]
        if int(refreshed["genre_index"]) >= len(refreshed["genre_codes"]):
            if remaining:
                if not job["tidal_rate_limited"] and not rate_limited_now:
                    _phase(connection, job_id, "waiting_for_retry")
            else:
                _phase(connection, job_id, "embedding")
                try:
                    embedded = embed_ems_batch(
                        connection,
                        lambda texts: embed_remote(texts, os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000")),
                        limit=16,
                    )["embedded"]
                except (httpx.HTTPError, ValueError):
                    _phase(connection, job_id, "embedding_retry")
                    return
                if not embedded:
                    _finish(connection, job_id, "completed")
        elif (int(refreshed["batch_discovered_count"]) >= BATCH_SIZE
              or (int(refreshed["batch_discovered_count"]) > 0 and int(refreshed["next_start_index"]) == 1)):
            if not remaining:
                connection.execute(
                    """UPDATE ems_melon_jobs SET batch_discovered_count = 0,
                              next_batch_at = now() + make_interval(secs => %s),
                              phase = 'batch_wait', heartbeat_at = now(), updated_at = now()
                        WHERE id = %s AND status = 'running'""",
                    (BATCH_INTERVAL_SECONDS, job_id),
                )
            elif not job["tidal_rate_limited"] and not rate_limited_now:
                ready = connection.execute(
                    """SELECT 1 FROM ems_ingest_candidates WHERE run_id = %s
                        AND resolver_status IN ('pending', 'retryable', 'resolving')
                        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
                        AND (lease_expires_at IS NULL OR lease_expires_at <= now()) LIMIT 1""",
                    (job_id,),
                ).fetchone()
                if not ready:
                    _phase(connection, job_id, "waiting_for_retry")


def fail_job(connection: Any, job_id: str, error: Exception) -> None:
    code = str(error) if isinstance(error, ValueError) else type(error).__name__.lower()
    _finish(connection, job_id, "failed", code[:120])


def schedule_refresh(connection: Any) -> bool:
    routine = connection.execute(
        """SELECT enabled, next_check_at <= now() AS due FROM ems_source_routines
             WHERE source_key = 'melon_genres'"""
    ).fetchone()
    if not routine or not routine["enabled"] or not routine["due"]:
        return False
    open_job = connection.execute(
        "SELECT id FROM ems_melon_jobs WHERE status IN ('pending', 'running', 'paused') LIMIT 1"
    ).fetchone()
    if open_job:
        return False
    with connection.transaction():
        run = connection.execute(
            """INSERT INTO ems_ingest_runs (run_type, snapshot_id, status, request_budget)
               VALUES ('melon_genres', 'scheduled-melon-' || gen_random_uuid()::text, 'pending', 0)
               RETURNING id"""
        ).fetchone()
        connection.execute("INSERT INTO ems_melon_jobs (id, status) VALUES (%s, 'pending')", (run["id"],))
        connection.execute(
            """UPDATE ems_source_routines SET status = 'queued', current_run_id = %s,
                      last_checked_at = now(), error_code = NULL, updated_at = now()
                WHERE source_key = 'melon_genres'""", (run["id"],),
        )
    return True
