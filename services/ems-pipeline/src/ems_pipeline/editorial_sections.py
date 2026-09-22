from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .tidal import TidalCatalogClient
from .tidal_popularity import (
    EditorialTrack,
    fetch_editorial_playlists,
    fetch_playlist_tracks,
)


@dataclass(frozen=True)
class SectionDefinition:
    slug: str
    title: str
    description: str
    queries: tuple[str, ...]
    playlist_name_terms: tuple[str, ...]


@dataclass(frozen=True)
class EditorialMembership:
    section_slug: str
    tidal_id: str
    isrc: str
    rank: int
    source_playlist_id: str
    source_playlist_name: str


@dataclass(frozen=True)
class SectionSyncCount:
    discovered: int
    joined: int
    stored: int


SECTION_DEFINITIONS = (
    SectionDefinition(
        "new-releases",
        "신곡 퍼레이드",
        "지금 막 도착한 새로운 음악",
        ("Best New Tracks", "New Arrivals"),
        ("new", "best new"),
    ),
    SectionDefinition(
        "seasonal-jazz",
        "시원한 가을 바람과 함께, 재즈",
        "여유로운 재즈 셀렉션",
        ("Jazz",),
        ("jazz",),
    ),
    SectionDefinition(
        "night-rnb",
        "도시의 밤을 채우는 R&B",
        "늦은 시간에 어울리는 부드러운 트랙",
        ("R&B",),
        ("r&b", "soul"),
    ),
    SectionDefinition(
        "feel-good",
        "기분 좋은 리듬이 필요할 때",
        "팝과 댄스 중심의 경쾌한 음악",
        ("Pop", "Dance"),
        ("pop", "dance", "party"),
    ),
    SectionDefinition(
        "focus",
        "잠깐, 음악에만 집중",
        "클래식과 차분한 연주곡",
        ("Classical", "Focus"),
        ("classical", "focus", "instrumental"),
    ),
)


def rank_section_tracks(
    section_slug: str,
    tracks: Iterable[EditorialTrack],
    *,
    playlist_id: str,
    playlist_name: str,
) -> list[EditorialMembership]:
    grouped: dict[str, list[EditorialTrack]] = {}
    for track in tracks:
        if not track.isrc.strip() or track.duration_ms < 30_000:
            continue
        grouped.setdefault(track.isrc.upper(), []).append(track)

    chosen = [
        min(
            group,
            key=lambda track: (
                -track.popularity,
                -track.playlist_followers,
                track.tidal_id,
            ),
        )
        for group in grouped.values()
    ]
    chosen.sort(
        key=lambda track: (
            -track.popularity,
            -track.playlist_followers,
            track.isrc.upper(),
            track.tidal_id,
        )
    )
    return [
        EditorialMembership(
            section_slug=section_slug,
            tidal_id=track.tidal_id,
            isrc=track.isrc.upper(),
            rank=rank,
            source_playlist_id=playlist_id,
            source_playlist_name=playlist_name,
        )
        for rank, track in enumerate(chosen)
    ]


def discover_editorial_memberships(
    client: TidalCatalogClient,
    token: str,
    *,
    playlist_limit: int = 12,
) -> list[EditorialMembership]:
    memberships: list[EditorialMembership] = []
    for definition in SECTION_DEFINITIONS:
        playlists = fetch_editorial_playlists(client, token, definition.queries)[
            :playlist_limit
        ]
        playlist = next(
            (
                item
                for item in playlists
                if any(
                    term.casefold() in item.name.casefold()
                    for term in definition.playlist_name_terms
                )
            ),
            None,
        )
        if playlist is None:
            continue
        memberships.extend(
            rank_section_tracks(
                definition.slug,
                fetch_playlist_tracks(client, token, playlist),
                playlist_id=playlist.playlist_id,
                playlist_name=playlist.name,
            )
        )
    return memberships


def sync_editorial_sections(
    connection: object,
    definitions: Iterable[SectionDefinition],
    memberships: Iterable[EditorialMembership],
    *,
    dry_run: bool,
) -> dict[str, SectionSyncCount]:
    definition_list = list(definitions)
    membership_list = list(memberships)
    tidal_ids = sorted({item.tidal_id for item in membership_list})
    isrcs = sorted({item.isrc.upper() for item in membership_list})
    rows = connection.execute(
        """SELECT id, tidal_id, upper(isrc) AS isrc
           FROM ems_tracks
           WHERE status = 'active'
             AND (tidal_id = ANY(%s) OR upper(isrc) = ANY(%s))""",
        (tidal_ids, isrcs),
    ).fetchall()
    by_tidal = {str(row["tidal_id"]): row for row in rows}
    by_isrc = {str(row["isrc"]).upper(): row for row in rows if row.get("isrc")}

    counts: dict[str, SectionSyncCount] = {}
    for sort_order, definition in enumerate(definition_list):
        discovered = [
            item for item in membership_list if item.section_slug == definition.slug
        ]
        joined: list[tuple[EditorialMembership, object]] = []
        seen_track_ids: set[str] = set()
        for item in discovered:
            row = by_tidal.get(item.tidal_id) or by_isrc.get(item.isrc.upper())
            if row is None or str(row["id"]) in seen_track_ids:
                continue
            seen_track_ids.add(str(row["id"]))
            joined.append((item, row["id"]))

        stored = 0
        if not dry_run:
            with connection.transaction():
                section = connection.execute(
                    """INSERT INTO ems_editorial_sections
                         (slug, title, description, sort_order, active, updated_at)
                       VALUES (%s, %s, %s, %s, true, now())
                       ON CONFLICT (slug) DO UPDATE SET
                         title = EXCLUDED.title,
                         description = EXCLUDED.description,
                         sort_order = EXCLUDED.sort_order,
                         active = true,
                         updated_at = now()
                       RETURNING id""",
                    (
                        definition.slug,
                        definition.title,
                        definition.description,
                        sort_order,
                    ),
                ).fetchone()
                section_id = section["id"]
                connection.execute(
                    "DELETE FROM ems_track_sections WHERE section_id = %s",
                    (section_id,),
                )
                for item, track_id in joined:
                    connection.execute(
                        """INSERT INTO ems_track_sections
                             (section_id, track_id, rank, source_playlist_id,
                              source_playlist_name, last_seen_at)
                           VALUES (%s, %s, %s, %s, %s, now())""",
                        (
                            section_id,
                            track_id,
                            item.rank,
                            item.source_playlist_id,
                            item.source_playlist_name,
                        ),
                    )
                stored = len(joined)

        counts[definition.slug] = SectionSyncCount(
            discovered=len(discovered),
            joined=len(joined),
            stored=stored,
        )
    return counts
