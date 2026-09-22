import pytest

from ems_pipeline.editorial_sections import (
    SECTION_DEFINITIONS,
    EditorialMembership,
    rank_section_tracks,
)
from ems_pipeline.tidal_popularity import EditorialTrack, resolve_next_page_url


def test_definitions_keep_approved_copy_and_order() -> None:
    assert [(item.slug, item.title) for item in SECTION_DEFINITIONS] == [
        ("new-releases", "신곡 퍼레이드"),
        ("seasonal-jazz", "시원한 가을 바람과 함께, 재즈"),
        ("night-rnb", "도시의 밤을 채우는 R&B"),
        ("feel-good", "기분 좋은 리듬이 필요할 때"),
        ("focus", "잠깐, 음악에만 집중"),
    ]


def test_rank_section_tracks_deduplicates_isrc_and_keeps_provenance() -> None:
    memberships = rank_section_tracks(
        "night-rnb",
        [
            EditorialTrack("tidal-low", "ISRC-A", "Song", "Artist", "Album", 180000, 0.4, 100),
            EditorialTrack("tidal-high", "isrc-a", "Song", "Artist", "Album", 180000, 0.9, 1000),
        ],
        playlist_id="playlist-a",
        playlist_name="R&B Hits",
    )

    assert memberships == [
        EditorialMembership(
            section_slug="night-rnb",
            tidal_id="tidal-high",
            isrc="ISRC-A",
            rank=0,
            source_playlist_id="playlist-a",
            source_playlist_name="R&B Hits",
        )
    ]


def test_pagination_rejects_external_repeated_and_oversized_sequences() -> None:
    with pytest.raises(ValueError, match="origin"):
        resolve_next_page_url(
            "https://openapi.tidal.com/v2",
            "https://evil.test/steal",
            set(),
            page_count=1,
        )
