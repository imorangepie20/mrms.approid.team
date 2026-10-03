"""관리자 선곡 미리보기. membership 쓰기는 확인 후 Web transaction에서만 수행한다."""
from __future__ import annotations

import os
from typing import Any

import httpx
import psycopg
from psycopg.types.json import Jsonb

from .editorial_sections import SECTION_DEFINITIONS, MIN_SECTION_TRACKS, project_editorial_sections, discover_editorial_memberships
from .tidal import TidalCatalogClient

SLUGS = [definition.slug for definition in SECTION_DEFINITIONS]
SNAPSHOT_SQL = """SELECT jsonb_build_object(
  'sections', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slug)
    FROM ems_editorial_sections s WHERE s.slug = ANY(%s)), '[]'::jsonb),
  'memberships', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.section_id,m.rank,m.track_id)
    FROM ems_track_sections m JOIN ems_editorial_sections s ON s.id=m.section_id
    WHERE s.slug = ANY(%s)), '[]'::jsonb)
) AS snapshot"""


def build_preview(connection: Any, memberships: list[Any], snapshot: dict[str, Any]) -> dict[str, Any]:
    projected = project_editorial_sections(
        connection, SECTION_DEFINITIONS, memberships, playable_only=True,
        current_track_ids=[row['track_id'] for row in snapshot['memberships']],
    )
    ids = [track_id for section in projected for _, track_id in section.joined]
    rows = connection.execute(
        "SELECT id,tidal_id,title,artist FROM ems_tracks WHERE id=ANY(%s::uuid[])", (ids,)
    ).fetchall()
    tracks = {str(row['id']): row for row in rows}
    existing = {row['slug']: row for row in snapshot['sections']}
    sections = []
    for section in projected:
        slug = section.definition.slug
        current = existing.get(slug)
        old_ids = {m['track_id'] for m in snapshot['memberships'] if current and m['section_id'] == current['id']}
        new_ids = {str(track_id) for _, track_id in section.joined}
        sections.append({
            'id': current['id'] if current else None, 'slug': slug,
            'title': section.definition.title, 'discovered': section.discovered,
            'currentCount': len(old_ids), 'addedCount': len(new_ids-old_ids), 'removedCount': len(old_ids-new_ids),
            'tracks': [{
                'id': str(track_id), 'tidalTrackId': str(tracks[str(track_id)]['tidal_id']),
                'title': tracks[str(track_id)]['title'], 'artist': tracks[str(track_id)]['artist'],
                'rank': rank, 'sourcePlaylistId': item.source_playlist_id,
                'sourcePlaylistName': item.source_playlist_name,
            } for rank, (item, track_id) in enumerate(section.joined)],
        })
    return {'sections': sections, 'canApply': len(existing) == 5 and all(len(s['tracks']) >= MIN_SECTION_TRACKS for s in sections)}


def service_editorial_refresh(connection: Any) -> bool:
    connection.execute("""UPDATE ems_editorial_refresh_jobs SET status='failed',error_code='worker_timeout',updated_at=now()
      WHERE status='running' AND updated_at < now()-interval '10 minutes'""")
    job = connection.execute("""UPDATE ems_editorial_refresh_jobs SET status='running',updated_at=now()
      WHERE id=(SELECT id FROM ems_editorial_refresh_jobs WHERE status='pending' ORDER BY created_at
        FOR UPDATE SKIP LOCKED LIMIT 1) AND status='pending' RETURNING id""").fetchone()
    if job is None:
        return False
    job_id = job['id']
    try:
        # HTTP 전에 기존 목록을 보관한다. 다른 경로에서 갱신하면 apply가 stale preview를 차단한다.
        snapshot = connection.execute(SNAPSHOT_SQL, (SLUGS, SLUGS)).fetchone()['snapshot']
        with httpx.Client(timeout=8.0) as http_client:
            client = TidalCatalogClient(os.environ['TIDAL_CLIENT_ID'], os.environ['TIDAL_CLIENT_SECRET'],
                request_budget=24, http_client=http_client)
            memberships = discover_editorial_memberships(client, client.get_token(), playlist_limit=2)
        preview = build_preview(connection, memberships, snapshot)
        connection.execute("""UPDATE ems_editorial_refresh_jobs
          SET status=%s,preview=%s,backup=%s,expires_at=now()+interval '30 minutes',error_code=%s,updated_at=now()
          WHERE id=%s AND status='running'""", (
            'ready' if preview['canApply'] else 'blocked', Jsonb(preview), Jsonb(snapshot),
            None if preview['canApply'] else 'insufficient_tracks', job_id,
        ))
    except psycopg.Error:
        raise
    except Exception as error:
        code = f'tidal_http_{error.response.status_code}' if isinstance(error, httpx.HTTPStatusError) else type(error).__name__.lower()
        connection.execute("""UPDATE ems_editorial_refresh_jobs SET status='failed',error_code=%s,updated_at=now()
          WHERE id=%s AND status='running'""", (code, job_id))
    return True
