from __future__ import annotations

import json
import os
import shutil
import time
from dataclasses import asdict
from typing import Any

import httpx
import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .embedding import embed_ems_batch, embed_remote
from .importer import stage_candidates
from .tidal import CatalogRequestPaused, ResolveResult, TidalCatalogClient
from .tidal_popularity import (
    DEFAULT_QUERIES,
    EditorialPlaylist,
    fetch_editorial_playlists,
    fetch_playlist_tracks,
    select_editorial_candidates,
)
from .worker import HealthGate, run_worker


def _job_status(connection: Any, job_id: str) -> str:
    row = connection.execute(
        "SELECT status FROM ems_admin_ingest_jobs WHERE id = %s", (job_id,)
    ).fetchone()
    return str(row["status"]) if row else "missing"


def _set_phase(connection: Any, job_id: str, phase: str) -> None:
    row = connection.execute(
        """UPDATE ems_admin_ingest_jobs
              SET status = 'running', phase = %s, heartbeat_at = now(), updated_at = now()
            WHERE id = %s AND status IN ('pending', 'running') RETURNING id""",
        (phase, job_id),
    ).fetchone()
    if row is None:
        raise CatalogRequestPaused("admin job paused")
    connection.execute(
        """UPDATE ems_ingest_runs SET status = 'running', heartbeat_at = now(),
                  started_at = COALESCE(started_at, now())
            WHERE id = %s AND EXISTS (
              SELECT 1 FROM ems_admin_ingest_jobs WHERE id = %s AND status = 'running')""",
        (job_id, job_id),
    )


def _record_request(connection: Any, job_id: str) -> None:
    while True:
        current = connection.execute(
            """SELECT status,
                      GREATEST(0, EXTRACT(EPOCH FROM next_retry_at - now())) AS wait_seconds
                 FROM ems_admin_ingest_jobs WHERE id = %s""",
            (job_id,),
        ).fetchone()
        if current is None or current["status"] != "running":
            raise CatalogRequestPaused("admin job paused")
        delay = float(current["wait_seconds"] or 0)
        if delay > 0:
            time.sleep(min(1.0, delay))
            continue
        row = connection.execute(
            """UPDATE ems_admin_ingest_jobs
                  SET request_count = request_count + 1, next_retry_at = NULL,
                      heartbeat_at = now(), updated_at = now()
                WHERE id = %s AND status = 'running'
                  AND (next_retry_at IS NULL OR next_retry_at <= now()) RETURNING id""",
            (job_id,),
        ).fetchone()
        if row is not None:
            return


def _rate_limit(connection: Any, job_id: str, seconds: int | None) -> None:
    if seconds is None:
        _set_phase(connection, job_id, "discovering")
        connection.execute(
            "UPDATE ems_admin_ingest_jobs SET next_retry_at = NULL WHERE id = %s AND status = 'running'",
            (job_id,),
        )
        return
    connection.execute(
        """UPDATE ems_admin_ingest_jobs
              SET phase = 'rate_limited', next_retry_at = now() + make_interval(secs => %s),
                  heartbeat_at = now(), updated_at = now()
            WHERE id = %s AND status = 'running'""",
        (seconds, job_id),
    )


def _record_progress(connection: Any, job_id: str) -> None:
    stats = connection.execute(
        """SELECT count(*)::int AS candidate_count,
                  count(*) FILTER (WHERE resolver_status = 'matched')::int AS matched_count
             FROM ems_ingest_candidates WHERE run_id = %s""",
        (job_id,),
    ).fetchone()
    active = connection.execute(
        "SELECT count(*)::int AS count FROM ems_tracks WHERE status = 'active'"
    ).fetchone()
    candidate_count = int(stats["candidate_count"])
    matched_count = int(stats["matched_count"])
    active_count = int(active["count"])
    with connection.transaction():
        connection.execute(
            """UPDATE ems_admin_ingest_jobs
                  SET active_track_count = %s, heartbeat_at = now(), updated_at = now()
                WHERE id = %s""",
            (active_count, job_id),
        )
        connection.execute(
            """UPDATE ems_ingest_runs
                  SET requested_count = %s, matched_count = %s, heartbeat_at = now()
                WHERE id = %s""",
            (candidate_count, matched_count, job_id),
        )
        connection.execute(
            """INSERT INTO ems_admin_ingest_samples
                  (job_id, active_track_count, candidate_count, matched_count)
                SELECT %s, %s, %s, %s
                 WHERE NOT EXISTS (
                   SELECT 1 FROM ems_admin_ingest_samples
                    WHERE job_id = %s AND active_track_count = %s
                      AND candidate_count = %s AND matched_count = %s
                      AND sampled_at > now() - interval '1 minute')""",
            (
                job_id, active_count, candidate_count, matched_count,
                job_id, active_count, candidate_count, matched_count,
            ),
        )


def _discover_playlists(connection: Any, job_id: str, client: TidalCatalogClient) -> None:
    _set_phase(connection, job_id, "discovering")
    playlists = fetch_editorial_playlists(client, client.get_token(), DEFAULT_QUERIES)
    connection.execute(
        """UPDATE ems_admin_ingest_jobs SET playlists = %s, updated_at = now()
            WHERE id = %s AND status = 'running' AND playlists IS NULL""",
        (Jsonb([asdict(playlist) for playlist in playlists]), job_id),
    )


def _stage_playlist(connection: Any, job_id: str, client: TidalCatalogClient) -> bool:
    job = connection.execute(
        "SELECT playlists, next_playlist_index FROM ems_admin_ingest_jobs WHERE id = %s",
        (job_id,),
    ).fetchone()
    playlists = job["playlists"]
    index = int(job["next_playlist_index"])
    if index >= len(playlists):
        return False
    _set_phase(connection, job_id, "discovering")
    playlist = EditorialPlaylist(**playlists[index])
    if playlist.updated_at:
        previous = connection.execute(
            "SELECT source_updated_at FROM ems_editorial_source_playlists WHERE playlist_id = %s",
            (playlist.playlist_id,),
        ).fetchone()
        if previous and previous["source_updated_at"] == playlist.updated_at:
            connection.execute(
                """UPDATE ems_admin_ingest_jobs SET next_playlist_index = %s,
                          updated_at = now(), heartbeat_at = now()
                    WHERE id = %s AND status = 'running' AND next_playlist_index = %s""",
                (index + 1, job_id, index),
            )
            return True
    tracks = fetch_playlist_tracks(client, client.get_token(), playlist)
    candidates = select_editorial_candidates(tracks, len(tracks)) if tracks else []
    if candidates:
        tidal_ids = [candidate.candidate_key.split(":", 2)[1] for candidate in candidates]
        isrcs = [candidate.isrc for candidate in candidates if candidate.isrc]
        existing = connection.execute(
            """SELECT tidal_id, isrc FROM ems_tracks
                WHERE status = 'active' AND (tidal_id = ANY(%s) OR isrc = ANY(%s))""",
            (tidal_ids, isrcs),
        ).fetchall()
        existing_ids = {str(row["tidal_id"]) for row in existing}
        existing_isrcs = {str(row["isrc"]).upper() for row in existing if row["isrc"]}
        candidates = [
            item for item in candidates
            if item.candidate_key.split(":", 2)[1] not in existing_ids
            and (not item.isrc or item.isrc.upper() not in existing_isrcs)
        ]
    with connection.transaction():
        start = connection.execute(
            "SELECT COALESCE(max(sequence_no), -1) + 1 AS sequence_start FROM ems_ingest_candidates WHERE run_id = %s",
            (job_id,),
        ).fetchone()["sequence_start"]
        stage_candidates(connection, job_id, candidates, sequence_start=int(start))
        connection.execute(
            """UPDATE ems_admin_ingest_jobs
                  SET next_playlist_index = %s, updated_at = now(), heartbeat_at = now()
                WHERE id = %s AND status = 'running' AND next_playlist_index = %s""",
            (index + 1, job_id, index),
        )
        if playlist.updated_at:
            connection.execute(
                """INSERT INTO ems_editorial_source_playlists
                      (playlist_id, source_updated_at, last_fetched_at, last_candidate_count)
                    VALUES (%s, %s, now(), %s)
                    ON CONFLICT (playlist_id) DO UPDATE SET
                      source_updated_at = EXCLUDED.source_updated_at,
                      last_fetched_at = now(), last_candidate_count = EXCLUDED.last_candidate_count""",
                (playlist.playlist_id, playlist.updated_at, len(candidates)),
            )
    _record_progress(connection, job_id)
    return True


def _unfinished_candidates(connection: Any, job_id: str) -> int:
    row = connection.execute(
        """SELECT count(*)::int AS count FROM ems_ingest_candidates
            WHERE run_id = %s AND resolver_status IN ('pending', 'resolving', 'retryable')""",
        (job_id,),
    ).fetchone()
    return int(row["count"])


def _wait_for_disk(connection: Any, job_id: str, client: TidalCatalogClient) -> None:
    gate = HealthGate()
    while True:
        disk = shutil.disk_usage("/")
        used_percent = 100 * disk.used / disk.total
        if gate.can_run(disk_used_percent=used_percent, database_ready=True, embedding_ready=True):
            return
        _set_phase(connection, job_id, "disk_wait")
        client.wait(30)


def _finish(connection: Any, job_id: str, status: str, error_code: str | None = None) -> None:
    with connection.transaction():
        connection.execute(
            """UPDATE ems_admin_ingest_jobs
                  SET status = %s, phase = 'finished', error_code = %s, next_retry_at = NULL,
                      updated_at = now(), finished_at = now(), heartbeat_at = now()
                WHERE id = %s AND status IN ('pending', 'running')""",
            (status, error_code, job_id),
        )
        connection.execute(
            """UPDATE ems_ingest_runs
                  SET status = %s, error_code = %s, finished_at = now(), heartbeat_at = now()
                WHERE id = %s AND status IN ('pending', 'running')""",
            (status, error_code, job_id),
        )
    _record_progress(connection, job_id)
    connection.execute(
        """UPDATE ems_source_routines
              SET status = CASE WHEN %s = 'completed' THEN 'idle' ELSE 'failed' END,
                  last_checked_at = now(),
                  last_success_at = CASE WHEN %s = 'completed' THEN now() ELSE last_success_at END,
                  next_check_at = now() + make_interval(secs => CASE WHEN %s = 'completed' THEN check_interval_seconds ELSE 21600 END),
                  error_code = %s, updated_at = now()
            WHERE source_key = 'tidal_editorial'""",
        (status, status, status, error_code),
    )


def _embed_one_batch(connection: Any, job_id: str, client: TidalCatalogClient) -> bool:
    _set_phase(connection, job_id, "embedding")
    client.wait(0)
    embedding_url = os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000").strip()
    try:
        result = embed_ems_batch(
            connection,
            lambda texts: embed_remote(texts, embedding_url),
            limit=16,
        )
    except (httpx.HTTPError, ValueError):
        _set_phase(connection, job_id, "embedding_retry")
        client.wait(30)
        return False
    _record_progress(connection, job_id)
    return result["embedded"] == 0


def process_job(connection: Any, job_id: str) -> None:
    interval = max(0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5")))
    client_id = os.environ["TIDAL_CLIENT_ID"].strip()
    client_secret = os.environ["TIDAL_CLIENT_SECRET"].strip()
    if not client_id or not client_secret:
        raise ValueError("tidal_credentials_missing")
    with httpx.Client(timeout=30) as http_client:
        client = TidalCatalogClient(
            client_id,
            client_secret,
            request_budget=None,
            http_client=http_client,
            min_request_interval_seconds=interval,
            should_continue=lambda: _job_status(connection, job_id) in {"pending", "running"},
            on_request=lambda: _record_request(connection, job_id),
            on_rate_limit=lambda seconds: _rate_limit(connection, job_id, seconds),
        )
        job = connection.execute(
            "SELECT playlists FROM ems_admin_ingest_jobs WHERE id = %s", (job_id,)
        ).fetchone()
        if job["playlists"] is None:
            _discover_playlists(connection, job_id, client)
        matched_since_embed = 0
        while _job_status(connection, job_id) in {"pending", "running"}:
            _wait_for_disk(connection, job_id, client)
            _set_phase(connection, job_id, "resolving")
            recent_result: ResolveResult | None = None

            def remember(result: ResolveResult) -> None:
                nonlocal recent_result
                recent_result = result

            counts = run_worker(
                connection, job_id, client,
                batch_size=1, max_batches=1, on_result=remember,
            )
            if sum(counts.values()):
                _record_progress(connection, job_id)
                matched_since_embed += counts.get("matched", 0)
                if matched_since_embed >= 16:
                    _embed_one_batch(connection, job_id, client)
                    matched_since_embed = 0
                if recent_result and recent_result.error_code == "rate_limited":
                    _rate_limit(connection, job_id, max(1, recent_result.retry_after_seconds or 60))
                    client.wait(max(1, recent_result.retry_after_seconds or 60))
                    _set_phase(connection, job_id, "resolving")
                elif recent_result and recent_result.status.value == "retryable":
                    client.wait(3)
                continue
            if _stage_playlist(connection, job_id, client):
                continue
            if _unfinished_candidates(connection, job_id):
                _set_phase(connection, job_id, "waiting_for_retry")
                client.wait(3)
                continue
            if not _embed_one_batch(connection, job_id, client):
                continue
            _finish(connection, job_id, "completed")
            return


def _schedule_tidal_refresh(connection: Any) -> bool:
    routine = connection.execute(
        """SELECT enabled, next_check_at <= now() AS due FROM ems_source_routines
            WHERE source_key = 'tidal_editorial'"""
    ).fetchone()
    if not routine or not routine["enabled"] or not routine["due"]:
        return False
    with connection.transaction():
        result = connection.execute(
            """WITH baseline AS (SELECT count(*)::int AS active_count FROM ems_tracks WHERE status = 'active'),
                 available AS (SELECT 1 WHERE NOT EXISTS (
                   SELECT 1 FROM ems_admin_ingest_jobs WHERE status IN ('pending', 'running', 'paused'))),
                 run AS (
                   INSERT INTO ems_ingest_runs (run_type, snapshot_id, status, request_budget, requested_count)
                   SELECT 'tidal_resolve', 'scheduled-editorial-' || gen_random_uuid()::text, 'pending', 0, 0
                     FROM available RETURNING id
                 ), job AS (
                   INSERT INTO ems_admin_ingest_jobs (id, status, starting_active_count, active_track_count)
                   SELECT run.id, 'pending', baseline.active_count, baseline.active_count
                     FROM run CROSS JOIN baseline RETURNING id, active_track_count
                 ), sample AS (
                   INSERT INTO ems_admin_ingest_samples (job_id, active_track_count, candidate_count, matched_count)
                   SELECT id, active_track_count, 0, 0 FROM job
                 ) SELECT id FROM job"""
        ).fetchone()
        if result is None:
            return False
        connection.execute(
            """UPDATE ems_source_routines SET status = 'resolving',
                      last_checked_at = now(), current_run_id = %s, error_code = NULL,
                      updated_at = now()
                WHERE source_key = 'tidal_editorial'""",
            (result["id"],),
        )
    return True


def _process_snapshot_run(connection: Any, run_id: str) -> None:
    interval = max(0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5")))
    connection.execute(
        """UPDATE ems_ingest_runs SET status = 'running',
                  started_at = COALESCE(started_at, now()), heartbeat_at = now()
            WHERE id = %s AND status IN ('pending', 'running')""",
        (run_id,),
    )
    connection.execute(
        """UPDATE ems_source_routines SET status = 'resolving', updated_at = now()
            WHERE current_run_id = %s""",
        (run_id,),
    )

    def can_continue() -> bool:
        row = connection.execute(
            """SELECT r.status, bool_and(s.enabled) AS enabled
                 FROM ems_ingest_runs r JOIN ems_source_routines s ON s.current_run_id = r.id
                WHERE r.id = %s GROUP BY r.status""",
            (run_id,),
        ).fetchone()
        return bool(row and row["status"] == "running" and row["enabled"])

    with httpx.Client(timeout=30) as http_client:
        client = TidalCatalogClient(
            os.environ["TIDAL_CLIENT_ID"].strip(),
            os.environ["TIDAL_CLIENT_SECRET"].strip(),
            request_budget=None,
            http_client=http_client,
            min_request_interval_seconds=interval,
            should_continue=can_continue,
        )
        matched_since_embed = 0
        processed_in_slice = 0
        while can_continue():
            if processed_in_slice >= 10:
                if matched_since_embed:
                    embed_ems_batch(connection, lambda texts: embed_remote(texts, os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000")), limit=16)
                return
            disk = shutil.disk_usage("/")
            if not HealthGate().can_run(disk_used_percent=100 * disk.used / disk.total, database_ready=True, embedding_ready=True):
                client.wait(30)
                continue
            recent_result: ResolveResult | None = None

            def remember(result: ResolveResult) -> None:
                nonlocal recent_result
                recent_result = result

            counts = run_worker(connection, run_id, client, batch_size=1, max_batches=1, on_result=remember)
            if sum(counts.values()):
                processed_in_slice += sum(counts.values())
                matched_since_embed += counts.get("matched", 0)
                connection.execute(
                    """UPDATE ems_ingest_runs SET matched_count = matched_count + %s,
                              heartbeat_at = now() WHERE id = %s""",
                    (counts.get("matched", 0), run_id),
                )
                if matched_since_embed >= 16:
                    embed_ems_batch(connection, lambda texts: embed_remote(texts, os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000")), limit=16)
                    matched_since_embed = 0
                if recent_result and recent_result.error_code == "rate_limited":
                    client.wait(max(1, recent_result.retry_after_seconds or 60))
                elif recent_result and recent_result.status.value == "retryable":
                    client.wait(3)
                continue
            if _unfinished_candidates(connection, run_id):
                client.wait(3)
                return
            while embed_ems_batch(connection, lambda texts: embed_remote(texts, os.environ.get("EMBEDDING_SERVICE_URL", "http://embedding:8000")), limit=16)["embedded"]:
                pass
            with connection.transaction():
                connection.execute(
                    """UPDATE ems_ingest_runs SET status = 'completed', finished_at = now(), heartbeat_at = now()
                        WHERE id = %s AND status = 'running'""",
                    (run_id,),
                )
                connection.execute(
                    """UPDATE ems_source_routines SET status = 'idle', last_success_at = now(),
                              error_code = NULL, updated_at = now()
                        WHERE current_run_id = %s""",
                    (run_id,),
                )
            return


def serve_admin_jobs() -> None:
    database_url = os.environ["DATABASE_URL"].strip()
    while True:
        try:
            with psycopg.connect(database_url, row_factory=dict_row, autocommit=True) as connection:
                locked = connection.execute(
                    "SELECT pg_try_advisory_lock(hashtext('music-pie-ems-admin-ingestion')) AS locked"
                ).fetchone()["locked"]
                if not locked:
                    time.sleep(5)
                    continue
                prefer_melon = True
                while True:
                    connection.execute(
                        """UPDATE ems_ingest_runs r SET status = 'pending'
                              FROM ems_source_routines s
                             WHERE r.id = s.current_run_id AND r.status = 'paused' AND s.enabled
                               AND s.source_key <> 'melon_genres'"""
                    )
                    job = connection.execute(
                        """SELECT id FROM ems_admin_ingest_jobs
                            WHERE status IN ('pending', 'running')
                            ORDER BY created_at LIMIT 1"""
                    ).fetchone()
                    if job is None:
                        melon_job = connection.execute(
                            """SELECT id FROM ems_melon_jobs WHERE status IN ('pending', 'running')
                                 ORDER BY created_at LIMIT 1"""
                        ).fetchone()
                        snapshot = connection.execute(
                            """SELECT r.id FROM ems_ingest_runs r
                                JOIN ems_source_routines s ON s.current_run_id = r.id
                               WHERE r.run_type = 'musicbrainz_snapshot'
                                 AND r.status IN ('pending', 'running') AND s.enabled
                               ORDER BY r.created_at LIMIT 1"""
                        ).fetchone()
                        if melon_job is not None and (snapshot is None or prefer_melon):
                            from .melon import fail_job, process_job as process_melon_job

                            melon_id = str(melon_job["id"])
                            try:
                                process_melon_job(connection, melon_id)
                            except CatalogRequestPaused:
                                pass
                            except psycopg.Error:
                                raise
                            except Exception as error:
                                fail_job(connection, melon_id, error)
                                print(json.dumps({"job_id": melon_id, "status": "failed", "error_code": str(error)[:120]}), flush=True)
                            time.sleep(1)
                            prefer_melon = False
                            continue
                        if snapshot is not None:
                            run_id = str(snapshot["id"])
                            try:
                                _process_snapshot_run(connection, run_id)
                            except CatalogRequestPaused:
                                connection.execute(
                                    "UPDATE ems_ingest_runs SET status = 'paused' WHERE id = %s AND status = 'running'",
                                    (run_id,),
                                )
                            except psycopg.Error:
                                raise
                            except Exception as error:
                                code = type(error).__name__.lower()
                                connection.execute(
                                    "UPDATE ems_ingest_runs SET status = 'failed', error_code = %s, finished_at = now() WHERE id = %s",
                                    (code, run_id),
                                )
                                connection.execute(
                                    "UPDATE ems_source_routines SET status = 'failed', error_code = %s WHERE current_run_id = %s",
                                    (code, run_id),
                                )
                                print(json.dumps({"run_id": run_id, "status": "failed", "error_code": code}), flush=True)
                            prefer_melon = True
                            continue
                        from .melon import schedule_refresh as schedule_melon_refresh

                        if schedule_melon_refresh(connection):
                            continue
                        if _schedule_tidal_refresh(connection):
                            continue
                        time.sleep(3)
                        continue
                    job_id = str(job["id"])
                    try:
                        process_job(connection, job_id)
                    except CatalogRequestPaused:
                        continue
                    except psycopg.Error:
                        raise
                    except Exception as error:
                        code = (
                            f"tidal_http_{error.response.status_code}"
                            if isinstance(error, httpx.HTTPStatusError)
                            else type(error).__name__.lower()
                        )
                        _finish(connection, job_id, "failed", code)
                        print(json.dumps({"job_id": job_id, "status": "failed", "error_code": code}), flush=True)
        except psycopg.Error:
            time.sleep(5)
