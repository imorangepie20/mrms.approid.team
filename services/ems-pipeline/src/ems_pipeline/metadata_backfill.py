from __future__ import annotations

import json
import os
from typing import Any

import httpx
import psycopg
from psycopg.rows import dict_row

from .tidal import TidalCatalogClient, parse_retry_after, parse_tracks


def backfill_tidal_metadata(*, interval_seconds: float = 3.0, batch_size: int = 20) -> dict[str, int]:
    """Preserve public TIDAL track/album attributes and album release dates in EMS."""
    if batch_size < 1 or batch_size > 20:
        raise ValueError("batch_size must be 1..20")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        rows = connection.execute(
            """SELECT id, tidal_id FROM ems_tracks WHERE status = 'active'
                 ORDER BY tidal_id"""
        ).fetchall()
        connection.commit()
        updated = 0
        dated = 0
        requests = 0
        with httpx.Client(timeout=30) as http_client:
            client = TidalCatalogClient(
                os.environ["TIDAL_CLIENT_ID"], os.environ["TIDAL_CLIENT_SECRET"],
                request_budget=None, http_client=http_client,
                min_request_interval_seconds=interval_seconds,
            )
            token = client.get_token()
            for offset in range(0, len(rows), batch_size):
                batch = rows[offset:offset + batch_size]
                ids = {str(row["tidal_id"]): row["id"] for row in batch}
                retries = 0
                while True:
                    client.before_request()
                    try:
                        response = http_client.get(
                            f"{client.api_base_url}/tracks",
                            params={"filter[id]": ",".join(ids), "countryCode": client.country_code, "include": "albums"},
                            headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"},
                        )
                    except httpx.RequestError:
                        if retries >= 4:
                            raise
                        client.wait(2 ** retries)
                        retries += 1
                        continue
                    requests += 1
                    if response.status_code == 401 and retries < 4:
                        token = client.get_token(force_refresh=True)
                        retries += 1
                        continue
                    if response.status_code == 429 and retries < 8:
                        client.wait(max(3, parse_retry_after(response.headers.get("Retry-After")) or 3))
                        retries += 1
                        continue
                    if response.status_code >= 500 and retries < 4:
                        client.wait(2 ** retries)
                        retries += 1
                        continue
                    response.raise_for_status()
                    break

                tracks = parse_tracks(response.json())
                with connection.transaction():
                    for track in tracks:
                        track_id = ids.get(track.id)
                        if track_id is None:
                            continue
                        connection.execute(
                            """UPDATE ems_tracks SET
                                 tidal_album_release_date = COALESCE(%s, tidal_album_release_date),
                                 release_date = COALESCE(release_date, %s)
                               WHERE id = %s""",
                            (track.release_date, track.release_date, track_id),
                        )
                        connection.execute(
                            """INSERT INTO ems_track_sources
                                 (track_id, source_type, source_id, source_license, metadata, last_seen_at)
                               VALUES (%s, 'tidal', %s, 'tidal-authorized-use', %s::jsonb, now())
                               ON CONFLICT (source_type, source_id) DO UPDATE SET
                                 metadata = EXCLUDED.metadata, last_seen_at = now()""",
                            (track_id, track.id, json.dumps(track.source_metadata or {})),
                        )
                        updated += 1
                        dated += int(track.release_date is not None)
                if (offset // batch_size + 1) % 10 == 0:
                    print(json.dumps({"processed": min(offset + batch_size, len(rows)), "updated": updated, "dated": dated, "requests": requests}), flush=True)
    return {"scanned": len(rows), "updated": updated, "dated": dated, "requests": requests}
