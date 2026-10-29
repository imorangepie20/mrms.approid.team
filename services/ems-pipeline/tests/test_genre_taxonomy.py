import pytest

from ems_pipeline import genre_taxonomy
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
    assert buckets_from_tags([("jazz", 4), ("rock", 3), ("pop", 2), ("blues", 1)]) == {
        "jazz": 4 / 9,
        "rock": 3 / 9,
        "pop": 2 / 9,
    }
    # ties are broken by bucket name, deterministically
    assert buckets_from_tags([("rock", 2), ("pop", 2), ("blues", 2), ("jazz", 2)]) == {
        "blues": 1 / 3,
        "jazz": 1 / 3,
        "pop": 1 / 3,
    }


NATIONALITY_TAGS = [
    "korean", "japanese", "anime", "chinese", "french", "german", "deutsch",
    "turkish", "greek", "indian", "african", "arabic", "brazilian",
]


@pytest.mark.parametrize("tag", NATIONALITY_TAGS + ["1960s", "female vocalists", "piano", "vocal", "fusion", "indie", "alternative", "acoustic", "lounge", "score", "world"])
def test_descriptor_and_nationality_tags_are_not_buckets(tag):
    assert bucket_for_tag(tag) is None


def test_nationality_tags_still_map_to_language():
    assert language_for_tag("korean") == "kor"
    assert language_for_tag("french") == "fra"
    assert language_for_tag("japanese") == "jpn"


def test_genre_specific_tags_keep_both():
    assert bucket_for_tag("enka") == "j-pop" and language_for_tag("enka") == "jpn"
    assert bucket_for_tag("schlager") == "schlager" and language_for_tag("schlager") == "deu"


def test_tag_appears_in_one_bucket_only():
    seen = [t for tags in genre_taxonomy._BUCKET_TAGS.values() for t in tags]
    assert len(seen) == len(set(seen))


def test_version():
    assert TAXONOMY_VERSION == "2026-10-29.1"
