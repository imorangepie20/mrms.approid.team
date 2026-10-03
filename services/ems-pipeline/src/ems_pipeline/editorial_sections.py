from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from .tidal import TidalCatalogClient
from .tidal_popularity import (
    EditorialPlaylist,
    EditorialRequestBudgetExceeded,
    EditorialTrack,
    fetch_editorial_playlists,
    fetch_playlist_tracks,
)


MAX_SECTION_TRACKS = 12
MIN_SECTION_TRACKS = 6
MIN_READY_SECTIONS = 4


class EditorialSectionSyncGateError(RuntimeError):
    pass


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


@dataclass(frozen=True)
class _ProjectedSection:
    definition: SectionDefinition
    sort_order: int
    discovered: int
    joined: tuple[tuple[EditorialMembership, object], ...]


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
                track.playlist_position,
                track.tidal_id,
            ),
        )
        for group in grouped.values()
    ]
    chosen.sort(
        key=lambda track: (
            -track.popularity,
            -track.playlist_followers,
            track.playlist_position,
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
        try:
            playlists = [
                item
                for item in fetch_editorial_playlists(client, token, definition.queries)
                if any(
                    term.casefold() in item.name.casefold()
                    for term in definition.playlist_name_terms
                )
            ]
        except EditorialRequestBudgetExceeded:
            break
        if definition.slug == "new-releases":
            playlists.sort(key=lambda item: item.playlist_id)
            playlists.sort(key=lambda item: item.followers, reverse=True)
            playlists.sort(key=lambda item: item.updated_at, reverse=True)
        playlists = playlists[:playlist_limit]
        if not playlists:
            continue
        try:
            playlist_tracks = [
                (playlist, track)
                for playlist in playlists
                for track in fetch_playlist_tracks(client, token, playlist, max_pages=1)
                if track.isrc.strip() and track.duration_ms >= 30_000
            ]
        except EditorialRequestBudgetExceeded:
            break
        playlist_order = {
            playlist.playlist_id: index for index, playlist in enumerate(playlists)
        }
        grouped: dict[str, list[tuple[EditorialPlaylist, EditorialTrack]]] = {}
        for playlist, track in playlist_tracks:
            grouped.setdefault(track.isrc.upper(), []).append((playlist, track))

        def rank_key(
            item: tuple[EditorialPlaylist, EditorialTrack],
        ) -> tuple[object, ...]:
            playlist, track = item
            if definition.slug == "new-releases":
                return (
                    playlist_order[playlist.playlist_id],
                    -track.popularity,
                    track.playlist_position,
                    -playlist.followers,
                    track.tidal_id,
                )
            return (
                -playlist.followers,
                -track.popularity,
                track.playlist_position,
                playlist.playlist_id,
                track.tidal_id,
            )

        chosen = [min(group, key=rank_key) for group in grouped.values()]
        chosen.sort(key=rank_key)
        memberships.extend(
            EditorialMembership(
                section_slug=definition.slug,
                tidal_id=track.tidal_id,
                isrc=track.isrc.upper(),
                rank=rank,
                source_playlist_id=playlist.playlist_id,
                source_playlist_name=playlist.name,
            )
            for rank, (playlist, track) in enumerate(chosen)
        )
    return memberships


def project_editorial_sections(
    connection: object,
    definitions: Iterable[SectionDefinition],
    memberships: Iterable[EditorialMembership],
    *,
    playable_only: bool = False,
) -> list[_ProjectedSection]:
    definition_list = list(definitions)
    membership_list = list(memberships)
    tidal_ids = sorted({item.tidal_id for item in membership_list})
    isrcs = sorted({item.isrc.upper() for item in membership_list})
    availability_filter = """AND duration_ms >= 30000 AND EXISTS (
        SELECT 1 FROM LATERAL (
          SELECT a.playable FROM ems_availability_events a
          WHERE a.track_id = ems_tracks.id AND a.region = 'KR' AND a.capability = 'STREAM'
          ORDER BY a.observed_at DESC, a.id DESC LIMIT 1
        ) latest WHERE latest.playable = true
    )""" if playable_only else ""
    rows = connection.execute(
        """SELECT id, tidal_id, upper(isrc) AS isrc
           FROM ems_tracks
           WHERE status = 'active'
             AND (tidal_id = ANY(%s) OR upper(isrc) = ANY(%s))
           """ + availability_filter + " ORDER BY id",
        (tidal_ids, isrcs),
    ).fetchall()
    by_tidal = {str(row["tidal_id"]): row for row in rows}
    by_isrc = {str(row["isrc"]).upper(): row for row in rows if row.get("isrc")}

    projected_sections: list[_ProjectedSection] = []
    seen_track_ids: set[str] = set()
    for sort_order, definition in enumerate(definition_list):
        discovered = [
            item for item in membership_list if item.section_slug == definition.slug
        ]
        discovered.sort(
            key=lambda item: (
                item.rank,
                item.tidal_id,
                item.isrc,
                item.source_playlist_id,
            )
        )
        joined: list[tuple[EditorialMembership, object]] = []
        for item in discovered:
            row = by_tidal.get(item.tidal_id) or by_isrc.get(item.isrc.upper())
            if row is None or str(row["id"]) in seen_track_ids:
                continue
            seen_track_ids.add(str(row["id"]))
            joined.append((item, row["id"]))
            if len(joined) == MAX_SECTION_TRACKS:
                break
        projected_sections.append(
            _ProjectedSection(
                definition=definition,
                sort_order=sort_order,
                discovered=len(discovered),
                joined=tuple(joined),
            )
        )

    return projected_sections


def sync_editorial_sections(
    connection: object,
    definitions: Iterable[SectionDefinition],
    memberships: Iterable[EditorialMembership],
    *,
    dry_run: bool,
    enforce_gate: bool = False,
) -> dict[str, SectionSyncCount]:
    projected_sections = project_editorial_sections(connection, definitions, memberships)
    ready_sections = sum(
        len(projected.joined) >= MIN_SECTION_TRACKS
        for projected in projected_sections
    )
    if enforce_gate and not dry_run and ready_sections < MIN_READY_SECTIONS:
        raise EditorialSectionSyncGateError(
            "editorial section sync gate failed: "
            f"ready_sections={ready_sections} required={MIN_READY_SECTIONS}"
        )

    if dry_run:
        return {
            projected.definition.slug: SectionSyncCount(
                discovered=projected.discovered,
                joined=len(projected.joined),
                stored=0,
            )
            for projected in projected_sections
        }

    with connection.transaction():
        for projected in projected_sections:
            definition = projected.definition
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
                    projected.sort_order,
                ),
            ).fetchone()
            section_id = section["id"]
            connection.execute(
                "DELETE FROM ems_track_sections WHERE section_id = %s",
                (section_id,),
            )
            for item, track_id in projected.joined:
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

    return {
        projected.definition.slug: SectionSyncCount(
            discovered=projected.discovered,
            joined=len(projected.joined),
            stored=len(projected.joined),
        )
        for projected in projected_sections
    }


def sync_editorial_sections_guarded(
    connection: object,
    definitions: Iterable[SectionDefinition],
    memberships: Iterable[EditorialMembership],
    *,
    dry_run: bool,
) -> dict[str, SectionSyncCount]:
    return sync_editorial_sections(
        connection,
        definitions,
        memberships,
        dry_run=dry_run,
        enforce_gate=True,
    )
