from ems_pipeline import cli
from ems_pipeline.music_attributes import resolve_attributes
from ems_pipeline.music_attributes_mb import ArtistFacts, TrackFacts


def facts(language=None, tags=None) -> TrackFacts:
    return TrackFacts("a", None, language, tags or [])


def artist(mb_language=None, mb_tags=None, lastfm=None) -> ArtistFacts:
    return ArtistFacts("a", "A", None, mb_tags or [], mb_language, lastfm or [])


def tags(*items):
    return [{"name": name, "count": count} for name, count in items]


def test_melon_trot_wins_genre() -> None:
    result = resolve_attributes(facts(), None, ["GN0700"], "t", "a")
    assert result[2] == {"trot": 1.0}
    assert result[3] == "melon"


def test_release_language_beats_script() -> None:
    result = resolve_attributes(facts("eng"), None, [], "안녕", "가수")
    assert result[:2] == ("eng", "musicbrainz_release")


def test_zxx_kept_as_language() -> None:
    assert resolve_attributes(facts("zxx"), None, [], "t", "a")[:2] == ("zxx", "musicbrainz_release")


def test_artist_language_before_lastfm() -> None:
    result = resolve_attributes(facts(), artist("jpn", lastfm=tags(("chanson", 100))), [], "t", "a")
    assert result[:2] == ("jpn", "musicbrainz_artist")


def test_lastfm_language_requires_weight() -> None:
    weak = artist(lastfm=tags(("jazz", 100), ("french", 10)))
    assert resolve_attributes(facts(), weak, [], "t", "a")[:2] == ("unknown", "none")
    strong = artist(lastfm=tags(("chanson", 100), ("jazz", 80)))
    assert resolve_attributes(facts(), strong, [], "t", "a")[:2] == ("fra", "lastfm_tag")


def test_script_fallback() -> None:
    assert resolve_attributes(facts(), None, [], "사랑", "a")[:2] == ("kor", "script")


def test_track_tags_then_artist_genre() -> None:
    track = resolve_attributes(facts(tags=tags(("jazz", 5))), artist(lastfm=tags(("rock", 9))), [], "t", "a")
    assert track[3] == "musicbrainz_recording" and set(track[2]) == {"jazz"}
    fallback = resolve_attributes(facts(), artist(mb_tags=tags(("rock", 9))), [], "t", "a")
    assert fallback[3] == "artist" and set(fallback[2]) == {"rock"}


def test_unknown_when_no_signal() -> None:
    assert resolve_attributes(facts(), None, [], "title", "name") == ("unknown", "none", {}, "none")


def test_cli_registers_commands() -> None:
    parser = cli.build_parser()
    assert parser.parse_args(["resolve-music-attributes"]).all is False
    assert parser.parse_args(["resolve-music-attributes", "--all"]).all is True
    assert parser.parse_args(["fetch-lastfm-artist-tags"]).limit == 3000
    args = parser.parse_args(["collect-musicbrainz-attributes", "--core", "c", "--derived-archive", "d", "--snapshot-id", "s"])
    assert args.snapshot_id == "s"
