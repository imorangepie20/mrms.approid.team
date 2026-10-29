"""Resolve final track language and genre buckets from stored facts (DB only, no network)."""
from __future__ import annotations

import json
from typing import Any

from .genre_taxonomy import (
    MELON_GENRE_BUCKETS,
    TAXONOMY_VERSION,
    artist_key,
    buckets_from_tags,
    language_for_tag,
    script_language,
)
from .music_attributes_mb import ArtistFacts, TagVote, TrackFacts

Resolved = tuple[str, str, dict[str, float], str]
LASTFM_LANGUAGE_MIN_SHARE = 0.25
BATCH_SIZE = 1000


def _pairs(votes: list[TagVote] | None) -> list[tuple[str, int]]:
    return [(str(vote["name"]), int(vote["count"])) for vote in votes or [] if vote.get("name")]


def _lastfm_language(tags: list[tuple[str, int]]) -> str | None:
    if not tags:
        return None
    maximum = max(count for _, count in tags)
    best: tuple[int, str] | None = None
    for name, count in tags:
        language = language_for_tag(name)
        if language is not None and (best is None or count > best[0]):
            best = (count, language)
    if best is not None and maximum > 0 and best[0] >= maximum * LASTFM_LANGUAGE_MIN_SHARE:
        return best[1]
    return None


def resolve_attributes(
    facts: TrackFacts,
    artist: ArtistFacts | None,
    melon_codes: list[str],
    title: str,
    artist_name: str,
) -> Resolved:
    lastfm = _pairs(artist.lastfm_tags) if artist else []
    if facts.mb_release_language:
        language, language_source = facts.mb_release_language, "musicbrainz_release"
    elif artist and artist.mb_language:
        language, language_source = artist.mb_language, "musicbrainz_artist"
    elif (tag_language := _lastfm_language(lastfm)) is not None:
        language, language_source = tag_language, "lastfm_tag"
    elif (script := script_language(f"{title} {artist_name}")) is not None:
        language, language_source = script, "script"
    else:
        language, language_source = "unknown", "none"

    melon_buckets = sorted({MELON_GENRE_BUCKETS[code] for code in melon_codes if code in MELON_GENRE_BUCKETS})
    if melon_buckets:
        return language, language_source, {bucket: 1.0 / len(melon_buckets) for bucket in melon_buckets}, "melon"
    track_buckets = buckets_from_tags(_pairs(facts.mb_tags))
    if track_buckets:
        return language, language_source, track_buckets, "musicbrainz_recording"
    artist_buckets = buckets_from_tags(_pairs(artist.mb_tags) + lastfm) if artist else {}
    if artist_buckets:
        return language, language_source, artist_buckets, "artist"
    return language, language_source, {}, "none"


_STALE = """(NOT %s OR a.track_id IS NULL OR a.resolved_at IS NULL
                          OR a.taxonomy_version IS DISTINCT FROM %s OR ar.updated_at > a.resolved_at)"""
_TABLES = {
    "ems": {
        "sql": f"""SELECT t.id, t.title, t.artist AS artist_name, a.artist_key, a.mb_recording_mbid,
                         a.mb_release_language, a.mb_tags
                    FROM ems_tracks t
                    LEFT JOIN ems_track_attributes a ON a.track_id = t.id
                    LEFT JOIN music_artist_attributes ar ON ar.artist_key = a.artist_key
                   WHERE t.status = 'active' AND t.id > %s::uuid AND {_STALE}
                   ORDER BY t.id LIMIT %s""",
        "attributes": "ems_track_attributes",
    },
    "music": {
        "sql": f"""SELECT t.id, t.title, t.artist_name, a.artist_key, a.mb_recording_mbid,
                         a.mb_release_language, a.mb_tags
                    FROM music_tracks t
                    LEFT JOIN music_track_attributes a ON a.track_id = t.id
                    LEFT JOIN music_artist_attributes ar ON ar.artist_key = a.artist_key
                   WHERE t.id > %s::uuid
                     AND EXISTS (SELECT 1 FROM user_playlist_tracks pt
                                   JOIN user_playlists p ON p.id = pt.playlist_id
                                  WHERE pt.track_id = t.id AND p.selected)
                     AND {_STALE}
                   ORDER BY t.id LIMIT %s""",
        "attributes": "music_track_attributes",
    },
}
_NIL_UUID = "00000000-0000-0000-0000-000000000000"


def _load_artists(connection: Any, keys: list[str]) -> dict[str, ArtistFacts]:
    if not keys:
        return {}
    rows = connection.execute(
        """SELECT artist_key, display_name, mb_artist_mbid, mb_tags, mb_language, lastfm_tags
             FROM music_artist_attributes WHERE artist_key = ANY(%s)""",
        (keys,),
    ).fetchall()
    return {
        row["artist_key"]: ArtistFacts(
            row["artist_key"], row["display_name"],
            str(row["mb_artist_mbid"]) if row["mb_artist_mbid"] else None,
            row["mb_tags"] or [], row["mb_language"], row["lastfm_tags"] or [],
        )
        for row in rows
    }


def _load_melon_codes(connection: Any, ids: list[str]) -> dict[str, list[str]]:
    rows = connection.execute(
        """SELECT s.track_id, g.genre_code
             FROM ems_track_sources s JOIN ems_melon_track_genres g ON g.song_id = s.source_id
            WHERE s.source_type = 'melon' AND s.track_id = ANY(%s::uuid[])""",
        (ids,),
    ).fetchall()
    codes: dict[str, list[str]] = {}
    for row in rows:
        codes.setdefault(str(row["track_id"]), []).append(row["genre_code"])
    return codes


def resolve_all(connection: Any, only_stale: bool = True) -> dict[str, int]:
    """Resolve language/genre for EMS and selected user tracks. Safe to re-run; no network.

    only_stale=True touches rows with no resolution, an older taxonomy version, or an artist
    updated after the row was resolved. only_stale=False re-resolves every eligible row
    (needed after a new MusicBrainz snapshot changes mb facts).
    """
    counts = {"resolved": 0, "language_known": 0, "genre_known": 0}
    for table, spec in _TABLES.items():
        last_id = _NIL_UUID
        while True:
            rows = connection.execute(
                spec["sql"], (last_id, only_stale, TAXONOMY_VERSION, BATCH_SIZE)
            ).fetchall()
            if not rows:
                break
            last_id = str(rows[-1]["id"])
            keys = [row["artist_key"] or artist_key(row["artist_name"] or "") for row in rows]
            artists = _load_artists(connection, sorted(set(keys)))
            melon = _load_melon_codes(connection, [str(row["id"]) for row in rows]) if table == "ems" else {}
            with connection.transaction():
                for row, key in zip(rows, keys):
                    track_id = str(row["id"])
                    facts = TrackFacts(
                        key,
                        str(row["mb_recording_mbid"]) if row["mb_recording_mbid"] else None,
                        row["mb_release_language"], row["mb_tags"] or [],
                    )
                    language, language_source, buckets, genre_source = resolve_attributes(
                        facts, artists.get(key), melon.get(track_id, []), row["title"] or "", row["artist_name"] or "",
                    )
                    connection.execute(
                        f"""INSERT INTO {spec['attributes']}
                              (track_id, artist_key, language, language_source, genre_buckets, genre_source,
                               taxonomy_version, resolved_at)
                            VALUES (%s::uuid, %s, %s, %s, %s::jsonb, %s, %s, now())
                            ON CONFLICT (track_id) DO UPDATE SET
                              language = EXCLUDED.language, language_source = EXCLUDED.language_source,
                              genre_buckets = EXCLUDED.genre_buckets, genre_source = EXCLUDED.genre_source,
                              taxonomy_version = EXCLUDED.taxonomy_version, resolved_at = EXCLUDED.resolved_at""",
                        (track_id, key, language, language_source, json.dumps(buckets), genre_source, TAXONOMY_VERSION),
                    )
                    counts["resolved"] += 1
                    counts["language_known"] += language != "unknown"
                    counts["genre_known"] += genre_source != "none"
    return counts
