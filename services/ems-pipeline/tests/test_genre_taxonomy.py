from ems_pipeline.genre_taxonomy import (
    MELON_GENRE_BUCKETS,
    TAXONOMY_VERSION,
    artist_key,
    bucket_for_tag,
    buckets_from_tags,
    language_for_tag,
    script_language,
)


def test_normalizes_artist_keys():
    assert artist_key("  Ｎancy   WILSON ") == "nancy wilson"


def test_maps_jazz_subgenres():
    assert bucket_for_tag("Hard Bop") == "jazz"
    assert bucket_for_tag("american") is None
    assert bucket_for_tag("seen live") is None
    assert bucket_for_tag("bossa nova") == "latin"
    assert bucket_for_tag("traditional pop") == "easy-listening"
    assert bucket_for_tag("chanson française") == "chanson"
    assert bucket_for_tag("Fado") == "fado"


def test_melon_trot():
    assert MELON_GENRE_BUCKETS["GN0700"] == "trot"
    assert MELON_GENRE_BUCKETS["GN0100"] == "k-ballad"


def test_language_tags():
    assert language_for_tag("fado") == "por"
    assert language_for_tag("Polish") == "pol"
    assert language_for_tag("chanson française") == "fra"
    assert language_for_tag("trot") == "kor"
    assert language_for_tag("jazz") is None


def test_script_language():
    assert script_language("눈물강 레옹강") == "kor"
    assert script_language("Pejzaż bez Ciebie") is None
    assert script_language("我心似你") == "zho"
    assert script_language("君の名は 愛") == "jpn"
    assert script_language("Привет") == "rus"


def test_buckets_from_tags():
    assert buckets_from_tags([("jazz", 3), ("vocal jazz", 1), ("american", 9)]) == {"jazz": 1.0}
    assert buckets_from_tags([("american", 2)]) == {}
    top = buckets_from_tags([("jazz", 4), ("rock", 3), ("pop", 2), ("blues", 1)])
    assert set(top) == {"jazz", "rock", "pop"}
    assert abs(sum(top.values()) - 1.0) < 1e-9


def test_version():
    assert TAXONOMY_VERSION == "2026-10-29.1"
