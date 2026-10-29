from __future__ import annotations

import re
import unicodedata
from collections import defaultdict

TAXONOMY_VERSION = "2026-10-29.1"

MELON_GENRE_BUCKETS: dict[str, str] = {
    "GN0100": "k-ballad",
    "GN0200": "k-pop",
    "GN0300": "hip-hop",
    "GN0400": "r&b-soul",
    "GN0500": "k-indie",
    "GN0600": "rock",
    "GN0700": "trot",
    "GN0800": "folk",
}

_BUCKET_TAGS: dict[str, tuple[str, ...]] = {
    "jazz": (
        "jazz", "vocal jazz", "cool jazz", "hard bop", "post-bop", "post bop", "bebop",
        "bop", "swing", "big band", "modal jazz", "contemporary jazz", "latin jazz",
        "jazz pop", "smooth jazz", "free jazz", "jazz fusion", "fusion", "acid jazz",
        "jazz vocal", "jazz vocals", "traditional jazz", "dixieland", "gypsy jazz",
        "jazz piano", "jazz guitar", "nu jazz", "soul jazz", "west coast jazz",
    ),
    "blues": ("blues", "delta blues", "blues rock", "electric blues", "rhythm and blues blues"),
    "classical": (
        "classical", "classical music", "baroque", "opera", "orchestral", 
        "chamber music", "piano", "contemporary classical", "symphony", "choral",
    ),
    "pop": ("pop", "dance pop", "synthpop", "synth-pop", "electropop", "indie pop", "teen pop", "pop rock", "power pop"),
    "rock": (
        "rock", "classic rock", "hard rock", "indie rock", "alternative rock", "alternative",
        "punk", "punk rock", "progressive rock", "psychedelic rock", "folk rock", "grunge",
        "indie", "post-punk", "garage rock", "soft rock",
    ),
    "metal": ("metal", "heavy metal", "death metal", "black metal", "thrash metal", "doom metal"),
    "hip-hop": ("hip-hop", "hip hop", "rap", "trap", "hiphop", "east coast hip hop"),
    "r&b-soul": ("r&b", "rnb", "soul", "rhythm and blues", "funk", "neo-soul", "neo soul", "motown", "disco", "gospel"),
    "electronic": (
        "electronic", "electronica", "house", "techno", "edm", "trance", "ambient",
        "dubstep", "drum and bass", "synthwave", "downtempo", "chillout", "lounge",
    ),
    "folk": ("folk", "singer-songwriter", "acoustic", "indie folk", "americana", "bluegrass"),
    "country": ("country", "country pop", "contemporary country", "outlaw country"),
    "latin": (
        "latin", "latin pop", "bossa nova", "samba", "mpb", "salsa", "bolero", "tango",
        "reggaeton", "ranchera", "flamenco", "cumbia", "merengue", "bachata", "latino",
        "brazilian", "musica popular brasileira", "tropicalia",
    ),
    "k-pop": ("k-pop", "kpop", "korean pop", "korean"),
    "k-ballad": ("k-ballad", "korean ballad"),
    "k-indie": ("k-indie", "korean indie"),
    "trot": ("trot", "k-trot", "korean trot"),
    "j-pop": ("j-pop", "jpop", "japanese pop", "j-rock", "city pop", "enka", "japanese", "anime"),
    "c-pop": ("c-pop", "cpop", "mandopop", "cantopop", "chinese pop", "chinese"),
    "chanson": ("chanson", "chanson française", "chanson francaise", "french chanson", "french pop", "french", "musette"),
    "fado": ("fado",),
    "schlager": ("schlager", "deutsch", "german", "volksmusik", "neue deutsche welle"),
    "world": ("world", "world music", "reggae", "ska", "afrobeat", "celtic", "african", "indian", "bollywood", "arabic", "turkish", "greek"),
    "soundtrack": ("soundtrack", "ost", "film score", "score", "musical", "musicals", "movie soundtrack", "original soundtrack", "cast recording", "show tunes"),
    "easy-listening": ("traditional pop", "easy listening", "standards", "vocal", "crooner", "adult contemporary", "vocal pop", "great american songbook", "american songbook", "exotica", "space age pop"),
    "christmas": ("christmas", "christmas music", "xmas", "holiday", "christmas songs", "holiday music"),
}

_TAG_TO_BUCKET: dict[str, str] = {
    tag: bucket for bucket, tags in _BUCKET_TAGS.items() for tag in tags
}

_LANGUAGE_TAGS: dict[str, tuple[str, ...]] = {
    "pol": ("polish", "polska", "polskie"),
    "fra": ("french", "chanson", "chanson française", "chanson francaise", "french chanson", "french pop", "français"),
    "por": ("fado", "portuguese", "mpb", "brazilian", "portugal", "brazilian music"),
    "deu": ("german", "schlager", "deutsch", "deutsche", "neue deutsche welle", "volksmusik"),
    "spa": ("spanish", "latin pop", "ranchera", "flamenco", "reggaeton", "bolero", "cumbia", "español"),
    "tur": ("turkish", "türk", "turk", "turkish pop"),
    "rus": ("russian", "russian pop"),
    "ita": ("italian", "italiano", "italian pop", "canzone italiana"),
    "kor": ("korean", "k-pop", "kpop", "trot", "k-trot", "k-ballad", "k-indie", "korean pop"),
    "jpn": ("japanese", "j-pop", "jpop", "enka", "j-rock", "city pop"),
    "zho": ("chinese", "mandopop", "c-pop", "cpop", "cantopop", "mandarin", "cantonese"),
}

_TAG_TO_LANGUAGE: dict[str, str] = {
    tag: lang for lang, tags in _LANGUAGE_TAGS.items() for tag in tags
}

_HANGUL = re.compile(r"[가-힣ᄀ-ᇿ㄰-㆏]")
_KANA = re.compile(r"[぀-ヿㇰ-ㇿ]")
_HAN = re.compile(r"[一-鿿㐀-䶿]")
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")


def artist_key(name: str) -> str:
    text = unicodedata.normalize("NFKC", name).casefold().strip()
    return re.sub(r"\s+", " ", text)


def _norm_tag(tag: str) -> str:
    return re.sub(r"\s+", " ", tag.strip().lower())


def bucket_for_tag(tag: str) -> str | None:
    return _TAG_TO_BUCKET.get(_norm_tag(tag))


def language_for_tag(tag: str) -> str | None:
    return _TAG_TO_LANGUAGE.get(_norm_tag(tag))


def script_language(text: str) -> str | None:
    if _HANGUL.search(text):
        return "kor"
    if _KANA.search(text):
        return "jpn"
    if _HAN.search(text):
        return "zho"
    if _CYRILLIC.search(text):
        return "rus"
    return None


def buckets_from_tags(tags: list[tuple[str, int]]) -> dict[str, float]:
    weights: dict[str, float] = defaultdict(float)
    for tag, count in tags:
        bucket = bucket_for_tag(tag)
        if bucket is not None and count > 0:
            weights[bucket] += count
    top = sorted(weights.items(), key=lambda item: (-item[1], item[0]))[:3]
    total = sum(weight for _, weight in top)
    if total <= 0:
        return {}
    return {bucket: weight / total for bucket, weight in top}
