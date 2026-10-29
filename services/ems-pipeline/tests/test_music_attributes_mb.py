import io
import tarfile
from pathlib import Path

from ems_pipeline.music_attributes_mb import ArtistFacts, MbTarget, TrackFacts, compute_mb_facts
from ems_pipeline.musicbrainz_match import match_recordings

MBID_A = "11111111-1111-1111-1111-111111111111"
MBID_B = "22222222-2222-2222-2222-222222222222"
MBID_C = "33333333-3333-3333-3333-333333333333"
ARTIST_MBID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
OTHER_MBID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
LANGUAGES = {1: "eng", 2: "mul", 3: "zxx", 4: "kor"}


def write_tsv(path: Path, rows: list[tuple[object, ...]]) -> None:
    path.write_text("".join("\t".join("\\N" if value is None else str(value) for value in row) + "\n" for row in rows),
                    encoding="utf-8")


def make_core(tmp_path: Path, *, releases: list[tuple[int, int, int, int]], tracks: list[tuple[int, int]],
              recordings: list[tuple[int, str, str, int, int]], isrcs: list[tuple[int, str]] = (),
              credits: list[tuple[int, int, str]] = (), artists: list[tuple[int, str, str]] = ()) -> Path:
    """releases: (id, artist_credit, release_group, language_id); tracks: (recording, release)."""
    core = tmp_path / "mbdump"
    core.mkdir()
    write_tsv(core / "isrc", [(index, recording, code, None, 0, "2020-01-01")
                              for index, (recording, code) in enumerate(isrcs, start=1)])
    write_tsv(core / "recording", [(rid, gid, name, credit, length, "", 0, "2020-01-01", "f")
                                   for rid, gid, name, credit, length in recordings])
    write_tsv(core / "language", [(lid, "x", "x", "x", "name", 1, code) for lid, code in LANGUAGES.items()])
    write_tsv(core / "release", [(rid, f"rel-{rid}", "Album", credit, group, 1, None, language, 1, "", 0, "x", 0, "d", "f")
                                 for rid, credit, group, language in releases])
    write_tsv(core / "medium", [(rid, rid, 1, 1, "", 0, "d", 1) for rid, _, _, _ in releases])
    write_tsv(core / "track", [(index, f"trk-{index}", recording, medium, 1, "1", "T", 1, 1000, 0, "d", "f")
                               for index, (recording, medium) in enumerate(tracks, start=1)])
    write_tsv(core / "artist_credit_name", [(credit, position, artist, name, "")
                                            for position, (credit, artist, name) in enumerate(credits)])
    write_tsv(core / "artist", [(aid, gid, name, name, None, None, None, None, None, None, None, None, None, "", 0, "d", "f",
                                 None, None) for aid, gid, name in artists])
    return core


def make_derived(tmp_path: Path, members: dict[str, list[tuple[object, ...]]]) -> Path:
    archive = tmp_path / "mbdump-derived.tar.bz2"
    with tarfile.open(archive, "w:bz2") as handle:
        for name in ("recording_tag", "release_group_tag", "artist_tag", "tag"):
            content = "".join("\t".join(str(value) for value in row) + "\n" for row in members.get(name, [])).encode()
            info = tarfile.TarInfo(f"mbdump/{name}")
            info.size = len(content)
            handle.addfile(info, io.BytesIO(content))
    return archive


def target(track_id: str, *, artist: str = "Artist", title: str = "Song", duration_ms: int | None = 200_000,
           isrc: str | None = None, recording_mbid: str | None = None, table: str = "ems") -> MbTarget:
    return MbTarget(table=table, track_id=track_id, artist_name=artist, title=title, duration_ms=duration_ms,
                    isrc=isrc, recording_mbid=recording_mbid)


def test_match_recordings_matches_by_isrc_title_duration(tmp_path: Path) -> None:
    core = make_core(
        tmp_path, releases=[], tracks=[],
        recordings=[(10, MBID_A, "Song (Live)!", 1, 204_000), (11, MBID_B, "Song", 1, 206_000),
                    (12, MBID_C, "Other", 1, 100_000)],
        isrcs=[(10, "USAAA0000001"), (11, "USAAA0000002"), (12, "USAAA0000003")],
    )
    rows = [
        {"id": "near", "isrc": "usaaa0000001", "title": "song live", "duration_ms": 200_000, "recording_mbid": None},
        {"id": "far", "isrc": "USAAA0000002", "title": "Song", "duration_ms": 200_000, "recording_mbid": None},
        {"id": "direct", "isrc": None, "title": "Different", "duration_ms": 1, "recording_mbid": MBID_C},
        {"id": "conflict", "isrc": "USAAA0000001", "title": "song live", "duration_ms": 200_000,
         "recording_mbid": MBID_B},
    ]

    matched = match_recordings(core, rows)

    assert matched == {"near": (10, MBID_A), "direct": (12, MBID_C), "conflict": (11, MBID_B)}


def test_release_language_mode_keeps_zxx_drops_mul(tmp_path: Path) -> None:
    core = make_core(
        tmp_path,
        releases=[(1, 1, 100, 1), (2, 1, 100, 1), (3, 1, 100, 2), (4, 1, 100, 2), (5, 1, 100, 2), (6, 1, 101, 3)],
        tracks=[(10, 1), (10, 2), (10, 3), (10, 4), (10, 5), (11, 6)],
        recordings=[(10, MBID_A, "Song", 1, 200_000), (11, MBID_B, "Noise", 1, 200_000)],
    )
    derived = make_derived(tmp_path, {})

    tracks, _ = compute_mb_facts(core, derived, [target("a", recording_mbid=MBID_A),
                                                 target("b", recording_mbid=MBID_B)])

    assert tracks[("ems", "a")].mb_release_language == "eng"
    assert tracks[("ems", "b")].mb_release_language == "zxx"
    assert tracks[("ems", "a")].mb_recording_mbid == MBID_A


def test_artist_language_ignores_zxx(tmp_path: Path) -> None:
    core = make_core(
        tmp_path,
        # Artist credit 1 (artist alone) on 3 zxx releases and 1 kor release; credit 2 is someone else.
        releases=[(1, 1, 100, 3), (2, 1, 101, 3), (3, 1, 102, 3), (4, 1, 103, 4), (5, 2, 104, 1), (6, 2, 105, 1)],
        tracks=[(10, 1)],
        recordings=[(10, MBID_A, "Song", 1, 200_000)],
        credits=[(1, 7, "The Artist"), (2, 8, "Somebody")],
        artists=[(7, ARTIST_MBID, "The Artist"), (8, OTHER_MBID, "Somebody")],
    )
    derived = make_derived(tmp_path, {"artist_tag": [(7, 1, 4), (8, 2, 9)], "tag": [(1, "jazz", 1), (2, "rock", 1)]})

    tracks, artists = compute_mb_facts(core, derived, [target("a", artist="the  ARTIST", recording_mbid=MBID_A)])

    assert tracks[("ems", "a")].artist_key == "the artist"
    assert artists["the artist"] == ArtistFacts(
        artist_key="the artist", display_name="the  ARTIST", mb_artist_mbid=ARTIST_MBID,
        mb_tags=[{"name": "jazz", "count": 4}], mb_language="kor",
    )


def test_featured_artist_is_not_linked(tmp_path: Path) -> None:
    core = make_core(
        tmp_path, releases=[(1, 1, 100, 1)], tracks=[(10, 1)],
        recordings=[(10, MBID_A, "Song", 1, 200_000)],
        credits=[(1, 7, "Main"), (1, 8, "Guest")],
        artists=[(7, ARTIST_MBID, "Main"), (8, OTHER_MBID, "Guest")],
    )
    derived = make_derived(tmp_path, {"artist_tag": [(8, 1, 5)], "tag": [(1, "rap", 1)]})

    _, artists = compute_mb_facts(core, derived, [target("a", artist="Main feat. Guest", recording_mbid=MBID_A)])

    assert artists == {"main feat. guest": ArtistFacts(
        artist_key="main feat. guest", display_name="Main feat. Guest", mb_artist_mbid=None,
        mb_tags=[], mb_language=None,
    )}


def test_track_tags_merge_recording_and_release_group(tmp_path: Path) -> None:
    core = make_core(
        tmp_path, releases=[(1, 1, 100, 1), (2, 1, 100, 1), (3, 1, 200, 1)], tracks=[(10, 1), (10, 2), (10, 3)],
        recordings=[(10, MBID_A, "Song", 1, 200_000), (11, MBID_B, "Unwanted", 1, 200_000)],
        isrcs=[(10, "USAAA0000001")],
    )
    derived = make_derived(tmp_path, {
        "recording_tag": [(10, 1, 2), (10, 3, 0), (11, 2, 50)],
        "release_group_tag": [(100, 1, 3), (100, 2, 1), (200, 4, 2), (999, 2, 40)],
        "tag": [(1, "jazz", 1), (2, "vocal jazz", 1), (3, "zero", 1), (4, "swing", 1)],
    })

    tracks, _ = compute_mb_facts(core, derived, [
        target("u", table="music", isrc="USAAA0000001", title="Song", duration_ms=201_000),
        target("none", title="Missing"),
    ])

    assert tracks[("music", "u")] == TrackFacts(
        artist_key="artist", mb_recording_mbid=MBID_A, mb_release_language="eng",
        mb_tags=[{"name": "jazz", "count": 5}, {"name": "swing", "count": 2}, {"name": "vocal jazz", "count": 1}],
    )
    assert tracks[("ems", "none")] == TrackFacts(
        artist_key="artist", mb_recording_mbid=None, mb_release_language=None, mb_tags=[],
    )
