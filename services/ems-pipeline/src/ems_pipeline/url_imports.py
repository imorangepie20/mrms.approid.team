from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx

from .melon import MelonClient, parse_songs
from .tidal import TidalCatalogClient, parse_tracks


@dataclass(frozen=True)
class PublicMusicUrl:
    source_type: str
    kind: str
    identifier: str
    start_index: int = 1


def classify_public_music_url(value: str) -> PublicMusicUrl | None:
    if not value or len(value) > 2048:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port or parsed.fragment:
        return None
    host = (parsed.hostname or "").lower()
    if host == "www.melon.com":
        query = parse_qs(parsed.query, keep_blank_values=True)
        if set(query) - {"gnrCode", "startIndex", "pageSize", "dtlGnrCode", "orderBy", "steadyYn"}:
            return None
        genres = query.get("gnrCode", [])
        if len(genres) != 1 or not re.fullmatch(r"GN0[1-8]00", genres[0]):
            return None
        if parsed.path == "/genre/song_list.htm":
            return PublicMusicUrl("melon", "genre", genres[0])
        if parsed.path == "/genre/song_listPaging.htm":
            starts = query.get("startIndex", [])
            sizes = query.get("pageSize", ["50"])
            if len(starts) != 1 or len(sizes) != 1 or sizes[0] != "50":
                return None
            try:
                start = int(starts[0])
            except ValueError:
                return None
            if not 1 <= start <= 1_000_000:
                return None
            return PublicMusicUrl("melon", "genre", genres[0], start)
        return None
    if host not in {"tidal.com", "www.tidal.com", "listen.tidal.com"}:
        return None
    parts = [part for part in parsed.path.split("/") if part]
    if parts and parts[0] == "browse":
        parts = parts[1:]
    if parsed.query or len(parts) != 2 or parts[0] not in {"track", "album", "playlist"}:
        return None
    if not re.fullmatch(r"[A-Za-z0-9:_-]{1,128}", parts[1]):
        return None
    return PublicMusicUrl("tidal", parts[0], parts[1])


def _melons(connection: Any, value: str, parsed: PublicMusicUrl, job_id: str) -> list[dict[str, Any]]:
    with httpx.Client(timeout=30, follow_redirects=False) as client:
        def allowed() -> bool:
            return True

        melon = MelonClient(client, should_continue=allowed,
                            on_request=lambda: _record_request(connection, job_id))
        page = melon.get_page(parsed.identifier, parsed.start_index)
    songs = parse_songs(page)[:100]
    return [{
        "source_id": song.song_id,
        "source_item_url": song.source_url,
        "title": song.title,
        "artist": song.artist,
        "album": song.album,
        "duration_ms": None,
        "artwork_url": None,
        "release_date": None,
        "metadata": {"sourceType": "melon", "genreCode": parsed.identifier, "inputUrl": value},
    } for song in songs]


def _tidal_items(value: str, parsed: PublicMusicUrl, client: TidalCatalogClient) -> list[dict[str, Any]]:
    api_origin = client.api_base_url
    token = client.get_token()
    if parsed.kind == "track":
        next_url: str | None = f"{api_origin}/tracks/{parsed.identifier}"
        params = {"countryCode": client.country_code, "include": "artists,albums,albums.coverArt"}
    else:
        next_url = f"{api_origin}/{parsed.kind}s/{parsed.identifier}/relationships/items"
        params = {"countryCode": client.country_code,
                  "include": "items,items.albums,items.artists,items.albums.coverArt"}
    tracks: list[Any] = []
    visited: set[str] = set()
    while next_url and len(tracks) < 100 and len(visited) < 10:
        url = httpx.URL(next_url)
        if url.scheme != "https" or url.host != httpx.URL(api_origin).host:
            raise ValueError("tidal_page_origin_blocked")
        if next_url in visited:
            raise ValueError("tidal_pagination_repeated")
        visited.add(next_url)
        client.before_request()
        response = client.http_client.get(
            next_url, params=params if len(visited) == 1 else None,
            headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"},
        )
        if response.status_code == 401:
            token = client.get_token(force_refresh=True)
            client.before_request()
            response = client.http_client.get(
                next_url, params=params if len(visited) == 1 else None,
                headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"},
            )
        if response.status_code == 429:
            raise ValueError("tidal_rate_limited")
        if response.status_code >= 400:
            raise ValueError("tidal_catalog_unavailable")
        document = response.json()
        tracks.extend(parse_tracks(document))
        link = (document.get("links") or {}).get("next")
        if isinstance(link, str) and link:
            next_url = str(httpx.URL(api_origin).join(link))
        else:
            next_url = None
        params = {}

    result: list[dict[str, Any]] = []
    for track in tracks[:100]:
        metadata = {"sourceType": "tidal", "inputUrl": value, "isrc": track.isrc,
                    "sourceMetadata": track.source_metadata or {}}
        result.append({
            "source_id": track.id,
            "source_item_url": f"https://tidal.com/browse/track/{track.id}",
            "title": track.title,
            "artist": track.artist,
            "album": track.album or None,
            "duration_ms": track.duration_ms,
            "artwork_url": track.artwork_url,
            "release_date": track.release_date,
            "metadata": metadata,
        })
    return result


def _record_request(connection: Any, job_id: str) -> None:
    connection.execute(
        "UPDATE ems_manual_url_import_jobs SET request_count = request_count + 1, updated_at = now() WHERE id = %s AND status = 'extracting'",
        (job_id,),
    )


def process_url_import_job(connection: Any, job_id: str) -> None:
    job = connection.execute(
        "UPDATE ems_manual_url_import_jobs SET status = 'extracting', phase = 'extracting', error_code = NULL, updated_at = now() WHERE id = %s AND status = 'pending' RETURNING source_type, source_url",
        (job_id,),
    ).fetchone()
    if not job:
        return
    source = classify_public_music_url(str(job["source_url"]))
    if source is None or source.source_type != job["source_type"]:
        raise ValueError("unsupported_music_url")

    if source.source_type == "melon":
        records = _melons(connection, str(job["source_url"]), source, job_id)
    else:
        with httpx.Client(timeout=30, follow_redirects=False) as http_client:
            tidal_requests = 0

            def record_tidal_request() -> None:
                nonlocal tidal_requests
                tidal_requests += 1
                _record_request(connection, job_id)
                if tidal_requests > 20:
                    raise ValueError("tidal_request_budget_exhausted")

            client = TidalCatalogClient(
                os.environ["TIDAL_CLIENT_ID"].strip(),
                os.environ["TIDAL_CLIENT_SECRET"].strip(),
                request_budget=20, http_client=http_client,
                min_request_interval_seconds=max(0.5, float(os.environ.get("TIDAL_MIN_REQUEST_INTERVAL_SECONDS", "1.5"))),
                on_request=record_tidal_request,
            )
            records = _tidal_items(str(job["source_url"]), source, client)
    if not records:
        raise ValueError("music_url_no_tracks")

    with connection.transaction():
        for sequence, record in enumerate(records[:100]):
            connection.execute(
                """INSERT INTO ems_manual_url_import_items
                     (job_id, sequence_no, source_id, source_item_url, title, artist, album,
                      duration_ms, artwork_url, release_date, metadata)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                   ON CONFLICT (job_id, source_id) DO NOTHING""",
                (job_id, sequence, record["source_id"], record["source_item_url"], record["title"],
                 record["artist"], record["album"], record["duration_ms"], record["artwork_url"],
                 record["release_date"], json.dumps(record["metadata"], ensure_ascii=False)),
            )
        connection.execute(
            """UPDATE ems_manual_url_import_jobs SET status = 'review', phase = 'review',
                      item_count = (SELECT count(*)::int FROM ems_manual_url_import_items WHERE job_id = %s),
                      collected_at = now(), updated_at = now() WHERE id = %s""",
            (job_id, job_id),
        )


def fail_url_import_job(connection: Any, job_id: str, error: Exception) -> None:
    raw = str(error) if isinstance(error, ValueError) else type(error).__name__.lower()
    code = re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:120] or "url_import_failed"
    connection.execute(
        "UPDATE ems_manual_url_import_jobs SET status = 'failed', phase = 'failed', error_code = %s, updated_at = now() WHERE id = %s AND status = 'extracting'",
        (code, job_id),
    )
