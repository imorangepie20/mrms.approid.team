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
) -> list[EditorialMembership]:
    memberships: list[EditorialMembership] = []
    for definition in SECTION_DEFINITIONS:
        playlists = fetch_editorial_playlists(client, token, definition.queries)
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
