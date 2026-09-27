from __future__ import annotations

import json
import os
import re
import shutil
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from .select import Candidate
from .tidal import CatalogRequestPaused, ResolveResult, ResolveStatus, TidalCatalogClient
from .worker import HealthGate, run_worker


SPOTIFY_REQUEST_BUDGET = 4
TIDAL_REQUEST_BUDGET = 450
TRACKS_PER_PLAYLIST = 50
RESOLVER_SLICE_SIZE = 10
SPOTIFY_EMBED_ORIGIN = "https://open.spotify.com"


@dataclass(frozen=True)
class SpotifyChartTarget:
    spotify_id: str
    title: str
    description: str


@dataclass(frozen=True)
class SpotifyChartTrack:
    spotify_id: str
    title: str
    artist: str
    resolver_artist: str
    duration_ms: int | None


@dataclass(frozen=True)
class SpotifyChartPlaylist:
    target: SpotifyChartTarget
    artwork_url: str | None
    tracks: tuple[SpotifyChartTrack, ...]


SPOTIFY_CHART_TARGETS = (
    SpotifyChartTarget(
        "37i9dQZEVXbNG2KDcFcKOF",
        "인기 곡 - 글로벌",
        "현재 가장 많이 재생된 트랙의 주간 글로벌 차트",
    ),
    SpotifyChartTarget(
        "37i9dQZEVXbJZGli0rRP3r",
        "인기 곡 - 대한민국",
        "현재 가장 많이 재생된 트랙의 주간 대한민국 차트",
    ),
    SpotifyChartTarget(
        "37i9dQZEVXbMDoHDwVN2tF",
        "Top 50 - 글로벌",
        "현재 가장 많이 재생된 트랙의 일간 글로벌 차트",
    ),
    SpotifyChartTarget(
        "37i9dQZEVXbNxXF4SkHj9F",
        "Top 50 - 대한민국",
        "현재 가장 많이 재생된 트랙의 일간 대한민국 차트",
    ),
)


def _clean_text(value: Any, *, maximum: int) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value.replace("\xa0", " ")).strip()[:maximum]


def _safe_artwork_url(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) > 2048:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
        return None
    if (parsed.hostname or "").lower() not in {"charts-images.scdn.co", "i.scdn.co"}:
        return None
    return value


def parse_spotify_embed(html: str, target: SpotifyChartTarget) -> SpotifyChartPlaylist:
    if not html or len(html.encode("utf-8")) > 2_000_000:
        raise ValueError("spotify_embed_size_invalid")
    script = BeautifulSoup(html, "html.parser").find("script", id="__NEXT_DATA__")
    if script is None or not script.string:
        raise ValueError("spotify_embed_payload_missing")
    try:
        payload = json.loads(script.string)
        entity = payload["props"]["pageProps"]["state"]["data"]["entity"]
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("spotify_embed_payload_invalid") from error
    if not isinstance(entity, dict) or entity.get("id") != target.spotify_id:
        raise ValueError("spotify_playlist_identity_mismatch")
    raw_tracks = entity.get("trackList")
    if not isinstance(raw_tracks, list) or len(raw_tracks) != TRACKS_PER_PLAYLIST:
        raise ValueError("spotify_playlist_track_count_invalid")
    tracks: list[SpotifyChartTrack] = []
    seen: set[str] = set()
    for raw in raw_tracks:
        if not isinstance(raw, dict):
            raise ValueError("spotify_track_invalid")
        uri = raw.get("uri")
        match = re.fullmatch(r"spotify:track:([A-Za-z0-9]{22})", uri or "")
        title = _clean_text(raw.get("title"), maximum=512)
        artist = _clean_text(raw.get("subtitle"), maximum=512)
        duration = raw.get("duration")
        if (
            match is None
            or match.group(1) in seen
            or not title
            or not artist
            or not isinstance(duration, int)
            or not 30_000 <= duration <= 7_200_000
        ):
            raise ValueError("spotify_track_invalid")
        seen.add(match.group(1))
        resolver_artist = artist.split(",", 1)[0].strip()
        if not resolver_artist:
            raise ValueError("spotify_track_invalid")
        tracks.append(SpotifyChartTrack(match.group(1), title, artist, resolver_artist, duration))
    cover_sources = ((entity.get("coverArt") or {}).get("sources") or [])
    artwork_url = next(
        (_safe_artwork_url(item.get("url")) for item in cover_sources if isinstance(item, dict)),
        None,
    )
    return SpotifyChartPlaylist(target, artwork_url, tuple(tracks))


def fetch_spotify_chart_playlists(
    http_client: httpx.Client,
    on_request: Callable[[], None],
) -> tuple[SpotifyChartPlaylist, ...]:
    playlists: list[SpotifyChartPlaylist] = []
    for target in SPOTIFY_CHART_TARGETS:
        on_request()
        response = http_client.get(
            f"{SPOTIFY_EMBED_ORIGIN}/embed/playlist/{target.spotify_id}",
            headers={"accept": "text/html", "user-agent": "MusicPie/1.0"},
        )
        if response.status_code == 429:
            raise ValueError("spotify_rate_limited")
        if response.status_code != 200:
            raise ValueError("spotify_embed_unavailable")
        playlists.append(parse_spotify_embed(response.text, target))
    return tuple(playlists)


def _status(connection: Any, run_id: str) -> str:
    row = connection.execute(
        "SELECT status FROM ems_spotify_chart_runs WHERE run_id = %s", (run_id,)
    ).fetchone()
    return str(row["status"]) if row else "missing"


def _set_status(
    connection: Any,
    run_id: str,
    status: str,
    phase: str,
    error_code: str | None = None,
) -> None:
    with connection.transaction():
        connection.execute(
            """UPDATE ems_spotify_chart_runs
                  SET status = %s, phase = %s, error_code = %s, updated_at = now(),
                      finished_at = CASE WHEN %s IN ('completed', 'failed') THEN now() ELSE finished_at END
                WHERE run_id = %s""",
            (status, phase, error_code, status, run_id),
        )
        connection.execute(
            """UPDATE ems_ingest_runs
                  SET status = %s, error_code = %s, heartbeat_at = now(),
                      started_at = COALESCE(started_at, now()),
                      finished_at = CASE WHEN %s IN ('completed', 'failed') THEN now() ELSE finished_at END
                WHERE id = %s""",
            (status, error_code, status, run_id),
        )


def _record_spotify_request(connection: Any, run_id: str) -> None:
    row = connection.execute(
        """UPDATE ems_spotify_chart_runs
              SET spotify_request_count = spotify_request_count + 1, updated_at = now()
            WHERE run_id = %s AND status = 'running'
              AND spotify_request_count < spotify_request_budget
            RETURNING run_id""",
        (run_id,),
    ).fetchone()
    if row is None:
        raise CatalogRequestPaused("spotify request budget exhausted")


def _record_tidal_request(connection: Any, run_id: str) -> None:
    row = connection.execute(
        """UPDATE ems_spotify_chart_runs
              SET tidal_request_count = tidal_request_count + 1, updated_at = now()
            WHERE run_id = %s AND status = 'running'
              AND tidal_request_count < %s
            RETURNING run_id""",
        (run_id, TIDAL_REQUEST_BUDGET),
    ).fetchone()
    if row is None:
        raise CatalogRequestPaused("tidal request budget exhausted")


def _stage_playlists(
    connection: Any,
    run_id: str,
    playlists: tuple[SpotifyChartPlaylist, ...],
) -> None:
    if len(playlists) != len(SPOTIFY_CHART_TARGETS):
        raise ValueError("spotify_playlist_count_invalid")
    unique_tracks: dict[str, SpotifyChartTrack] = {}
    with connection.transaction():
        for display_order, playlist in enumerate(playlists):
            playlist_row = connection.execute(
                """INSERT INTO ems_spotify_chart_playlists
                     (run_id, spotify_id, title, description, artwork_url, source_url,
                      display_order, source_track_count)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (
                    run_id,
                    playlist.target.spotify_id,
                    playlist.target.title,
                    playlist.target.description,
                    playlist.artwork_url,
                    f"https://open.spotify.com/playlist/{playlist.target.spotify_id}",
                    display_order,
                    len(playlist.tracks),
                ),
            ).fetchone()
            if playlist_row is None:
                raise RuntimeError("spotify_playlist_insert_failed")
            rows = []
            for sequence, track in enumerate(playlist.tracks):
                candidate_key = f"spotify:{track.spotify_id}"
                unique_tracks.setdefault(track.spotify_id, track)
                rows.append(
                    (
                        playlist_row["id"], sequence, track.spotify_id, candidate_key,
                        track.title, track.artist, track.duration_ms,
                    )
                )
            with connection.cursor() as cursor:
                cursor.executemany(
                    """INSERT INTO ems_spotify_chart_items
                         (playlist_id, sequence_no, spotify_track_id, candidate_key,
                          title, artist, duration_ms)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    rows,
                )
        with connection.cursor() as cursor:
            cursor.executemany(
                """INSERT INTO ems_ingest_candidates
                     (run_id, sequence_no, candidate_key, title, artist, duration_ms,
                      selection_bucket, selection_score)
                   VALUES (%s, %s, %s, %s, %s, %s, 'user_import', 1.0)""",
                [
                    (
                        run_id, sequence, f"spotify:{track.spotify_id}", track.title,
                        track.resolver_artist, track.duration_ms,
                    )
                    for sequence, track in enumerate(unique_tracks.values())
                ],
            )
        connection.execute(
            """UPDATE ems_ingest_runs
                  SET requested_count = %s, status = 'running', heartbeat_at = now()
                WHERE id = %s""",
            (len(unique_tracks), run_id),
        )
        connection.execute(
            """UPDATE ems_spotify_chart_runs
                  SET phase = 'resolving', updated_at = now()
                WHERE run_id = %s AND status = 'running'""",
            (run_id,),
        )


def _activate_completed_snapshot(connection: Any, run_id: str) -> None:
    validation = connection.execute(
        """SELECT count(DISTINCT playlist.id)::int AS playlist_count,
                  count(item.*)::int AS membership_count,
                  min(playlist.source_track_count)::int AS minimum_track_count,
                  count(candidate.id) FILTER (WHERE candidate.resolver_status = 'matched')::int AS matched_count
             FROM ems_spotify_chart_playlists playlist
             JOIN ems_spotify_chart_items item ON item.playlist_id = playlist.id
             JOIN ems_ingest_candidates candidate
               ON candidate.run_id = playlist.run_id AND candidate.candidate_key = item.candidate_key
            WHERE playlist.run_id = %s""",
        (run_id,),
    ).fetchone()
    if (
        validation is None
        or int(validation["playlist_count"]) != 4
        or int(validation["membership_count"]) != 200
        or int(validation["minimum_track_count"]) != 50
        or int(validation["matched_count"]) == 0
    ):
        raise ValueError("spotify_snapshot_validation_failed")
    with connection.transaction():
        locked = connection.execute(
            """SELECT run_id FROM ems_spotify_chart_runs
                WHERE run_id = %s AND status = 'running' FOR UPDATE""",
            (run_id,),
        ).fetchone()
        if locked is None:
            raise CatalogRequestPaused("spotify chart run paused before activation")
        connection.execute(
            "UPDATE ems_spotify_chart_runs SET active = false, updated_at = now() WHERE active",
        )
        connection.execute(
            """UPDATE ems_tracks track
                  SET status = 'active', updated_at = now()
                 FROM ems_ingest_candidates candidate
                WHERE candidate.run_id = %s AND candidate.resolver_status = 'matched'
                  AND candidate.tidal_id = track.tidal_id""",
            (run_id,),
        )
        connection.execute(
            """UPDATE ems_spotify_chart_runs
                  SET status = 'completed', phase = 'finished', active = true,
                      error_code = NULL, activated_at = now(), finished_at = now(), updated_at = now()
                WHERE run_id = %s AND status = 'running'""",
            (run_id,),
        )
        connection.execute(
            """UPDATE ems_ingest_runs
                  SET status = 'completed', matched_count = (
                        SELECT count(*)::int FROM ems_ingest_candidates
                         WHERE run_id = %s AND resolver_status = 'matched'
                      ), error_code = NULL, heartbeat_at = now(), finished_at = now()
                WHERE id = %s AND status = 'running'""",
            (run_id, run_id),
        )


def process_spotify_chart_run(connection: Any, run_id: str) -> None:
    claimed = connection.execute(
        """UPDATE ems_spotify_chart_runs
              SET status = 'running', phase = CASE WHEN phase = 'queued' THEN 'fetching' ELSE phase END,
                  error_code = NULL, updated_at = now()
            WHERE run_id = %s AND status IN ('pending', 'running')
            RETURNING spotify_request_count, tidal_request_count""",
        (run_id,),
    ).fetchone()
    if claimed is None:
        return
    connection.execute(
        """UPDATE ems_ingest_runs SET status = 'running', started_at = COALESCE(started_at, now()),
                  heartbeat_at = now() WHERE id = %s AND status IN ('pending', 'running')""",
        (run_id,),
    )
    disk = shutil.disk_usage("/")
    if not HealthGate().can_run(
        disk_used_percent=100 * disk.used / disk.total,
        database_ready=True,
        embedding_ready=True,
    ):
        _set_status(connection, run_id, "paused", "disk_wait", "disk_guard")
        return
    playlist_count = connection.execute(
        "SELECT count(*)::int AS count FROM ems_spotify_chart_playlists WHERE run_id = %s",
        (run_id,),
    ).fetchone()["count"]
    if int(playlist_count) == 0:
        with httpx.Client(timeout=30, follow_redirects=False) as http_client:
            playlists = fetch_spotify_chart_playlists(
                http_client,
                lambda: _record_spotify_request(connection, run_id),
            )
        _stage_playlists(connection, run_id, playlists)
    elif int(playlist_count) != 4:
        raise ValueError("spotify_playlist_count_invalid")

    budget = connection.execute(
        "SELECT tidal_request_count FROM ems_spotify_chart_runs WHERE run_id = %s",
        (run_id,),
    ).fetchone()
    remaining = TIDAL_REQUEST_BUDGET - int(budget["tidal_request_count"])
    recent: list[ResolveResult] = []
    with httpx.Client(timeout=30, follow_redirects=False) as http_client:
        client = TidalCatalogClient(
            os.environ["TIDAL_CLIENT_ID"].strip(),
            os.environ["TIDAL_CLIENT_SECRET"].strip(),
            request_budget=max(0, remaining - 1),
            http_client=http_client,
            min_request_interval_seconds=max(
                0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5"))
            ),
            should_continue=lambda: _status(connection, run_id) == "running",
            on_request=lambda: _record_tidal_request(connection, run_id),
        )
        counts = run_worker(
            connection,
            run_id,
            client,
            batch_size=1,
            max_batches=RESOLVER_SLICE_SIZE,
            on_result=recent.append,
        )
    matched = connection.execute(
        """SELECT count(*)::int AS count FROM ems_ingest_candidates
            WHERE run_id = %s AND resolver_status = 'matched'""",
        (run_id,),
    ).fetchone()["count"]
    connection.execute(
        "UPDATE ems_ingest_runs SET matched_count = %s, heartbeat_at = now() WHERE id = %s",
        (matched, run_id),
    )
    if counts.get(ResolveStatus.BUDGET_EXHAUSTED.value, 0):
        _set_status(connection, run_id, "failed", "request_budget_exhausted", "request_budget_exhausted")
        return
    if any(result.error_code == "rate_limited" for result in recent):
        _set_status(connection, run_id, "paused", "rate_limited", "rate_limited")
        return
    unfinished = connection.execute(
        """SELECT count(*)::int AS count FROM ems_ingest_candidates
            WHERE run_id = %s AND resolver_status IN ('pending', 'resolving', 'retryable')""",
        (run_id,),
    ).fetchone()["count"]
    if int(unfinished) > 0:
        connection.execute(
            """UPDATE ems_spotify_chart_runs SET phase = %s, updated_at = now()
                WHERE run_id = %s AND status = 'running'""",
            ("waiting_for_retry" if counts.get("retryable", 0) else "resolving", run_id),
        )
        return
    _activate_completed_snapshot(connection, run_id)


def fail_spotify_chart_run(connection: Any, run_id: str, error: Exception) -> None:
    raw = str(error) if isinstance(error, ValueError) else type(error).__name__.lower()
    error_code = re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:120] or "spotify_chart_failed"
    _set_status(connection, run_id, "failed", "failed", error_code)
