from pathlib import Path

from ems_pipeline.select import CandidateSelector, CanonicalRow, write_candidate_artifacts


def rows(count: int = 40) -> list[CanonicalRow]:
    return [
        CanonicalRow(
            recording_mbid=f"mbid-{index:03d}",
            isrc=f"ISRC{index:03d}",
            title=f"Track {index}",
            artist=f"Artist {index % 30}",
            album=f"Album {index % 6}",
            duration_ms=180_000 + index,
            release_date=f"20{index % 24:02d}-01-01",
            artist_region="KR" if index % 2 else "US",
            canonical_score=(index % 10) / 10,
        )
        for index in range(count)
    ]


def test_selection_is_deterministic_and_uses_three_buckets() -> None:
    selector = CandidateSelector(seed=17)
    first = selector.select(rows(), limit=20)
    second = selector.select(rows(), limit=20)

    assert first == second
    assert len(first) == 20
    assert {candidate.selection_bucket for candidate in first} == {"canonical", "diversity", "long_tail"}


def test_selection_enforces_artist_and_release_caps() -> None:
    source = [row.__class__(**{**row.__dict__, "artist": "Same Artist"}) for row in rows(100)]
    selected = CandidateSelector(seed=1).select(source, limit=100)
    counts_by_artist: dict[str, int] = {}
    counts_by_album: dict[str, int] = {}
    for candidate in selected:
        counts_by_artist[candidate.artist] = counts_by_artist.get(candidate.artist, 0) + 1
        counts_by_album[candidate.album or ""] = counts_by_album.get(candidate.album or "", 0) + 1

    assert max(counts_by_artist.values()) <= 1
    assert max(counts_by_album.values()) <= 5


def test_selection_rejects_unresolvable_rows_before_ranking() -> None:
    invalid = [
        CanonicalRow("missing-isrc", None, "Normal Song", "Artist", "Album", 180_000, "2020-01-01", "US", 1.0),
        CanonicalRow("missing-duration", "USABC123", "Normal Song", "Artist 2", "Album", None, "2020-01-01", "US", 1.0),
        CanonicalRow("spoken-content", "USABC124", "The Interview Sessions", "Artist 3", "Album", 180_000, "2020-01-01", "US", 1.0),
    ]

    selected = CandidateSelector(seed=17).select(rows() + invalid, limit=100)

    assert all(candidate.isrc for candidate in selected)
    assert all(candidate.duration_ms and candidate.duration_ms >= 30_000 for candidate in selected)
    assert all("interview" not in candidate.title.lower() for candidate in selected)


def test_large_selection_allows_multiple_tracks_per_artist() -> None:
    selected = CandidateSelector(seed=17).select(rows(100), limit=1000)
    counts: dict[str, int] = {}
    for candidate in selected:
        counts[candidate.artist] = counts.get(candidate.artist, 0) + 1

    assert max(counts.values()) > 1
    assert max(counts.values()) <= 5


def test_selection_prioritizes_popular_tracks_across_all_buckets() -> None:
    source = [
        CanonicalRow(
            recording_mbid=f"popular-{index:03d}",
            isrc=f"POPULAR{index:03d}",
            title=f"Popular Track {index}",
            artist=f"Popular Artist {index}",
            album=f"Popular Album {index}",
            duration_ms=180_000,
            release_date="2025-01-01",
            artist_region="US",
            canonical_score=index / 99,
        )
        for index in range(100)
    ]

    selected = CandidateSelector(seed=17).select(source, limit=20)

    assert {candidate.recording_mbid for candidate in selected} == {
        f"popular-{index:03d}" for index in range(80, 100)
    }


def test_candidate_artifact_is_byte_deterministic(tmp_path: Path) -> None:
    candidates = CandidateSelector(seed=17).select(rows(), limit=20)

    first, _ = write_candidate_artifacts(candidates, tmp_path / "first", "snapshot", 17)
    second, _ = write_candidate_artifacts(candidates, tmp_path / "second", "snapshot", 17)

    assert first.read_bytes() == second.read_bytes()
