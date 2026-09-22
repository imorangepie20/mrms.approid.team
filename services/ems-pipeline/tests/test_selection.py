from ems_pipeline.select import CandidateSelector, CanonicalRow


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
