"""Collect raw MusicBrainz language and tag facts for EMS and selected user-library tracks.

Only the ``mb_*`` columns of the attribute tables are written here; the final
language/genre resolution happens in a later step.
"""
from __future__ import annotations

import json
import os
import tarfile
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Iterator, Literal, Sequence

import psycopg
from psycopg.rows import dict_row

from .genre_taxonomy import artist_key
from .musicbrainz_match import match_recordings_with_credits

TagVote = dict[str, Any]  # {"name": str, "count": int}
DERIVED_MEMBERS = frozenset({"recording_tag", "release_group_tag", "artist_tag", "tag"})
TRACK_LANGUAGE_EXCLUDED = frozenset({"mul"})
ARTIST_LANGUAGE_EXCLUDED = frozenset({"mul", "zxx"})


@dataclass(frozen=True)
class MbTarget:
    table: Literal["ems", "music"]
    track_id: str
    artist_name: str
    title: str
    duration_ms: int | None
    isrc: str | None
    recording_mbid: str | None


@dataclass
class TrackFacts:
    artist_key: str
    mb_recording_mbid: str | None
    mb_release_language: str | None
    mb_tags: list[TagVote] = field(default_factory=list)


@dataclass
class ArtistFacts:
    artist_key: str
    display_name: str
    mb_artist_mbid: str | None
    mb_tags: list[TagVote] = field(default_factory=list)
    mb_language: str | None = None
    lastfm_tags: list[TagVote] = field(default_factory=list)


def _rows(path: Path) -> Iterator[list[str]]:
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            yield line.rstrip("\n").split("\t")


def _int(value: str) -> int | None:
    return int(value) if value.isdigit() else None


def _mode(codes: Iterable[str | None], excluded: frozenset[str]) -> str | None:
    counts = Counter(code for code in codes if code and code not in excluded)
    if not counts:
        return None
    return min(counts, key=lambda code: (-counts[code], code))


def _named(votes: Counter[int], tag_names: dict[int, str]) -> list[TagVote]:
    totals: Counter[str] = Counter()
    for tag_id, count in votes.items():
        if tag_id in tag_names:
            totals[tag_names[tag_id]] += count
    return [{"name": name, "count": count} for name, count in sorted(totals.items(), key=lambda item: (-item[1], item[0]))]


def _read_derived_tags(
    derived_archive: Path, recordings: set[int], groups: set[int], artists: set[int]
) -> tuple[dict[str, dict[int, Counter[int]]], dict[int, str]]:
    wanted = {"recording_tag": recordings, "release_group_tag": groups, "artist_tag": artists}
    votes: dict[str, dict[int, Counter[int]]] = {name: defaultdict(Counter) for name in wanted}
    tag_names: dict[int, str] = {}
    found: set[str] = set()
    with tarfile.open(derived_archive, mode="r|bz2") as archive:
        for member in archive:
            name = member.name.rsplit("/", 1)[-1]
            if name not in DERIVED_MEMBERS or not member.isfile():
                continue
            found.add(name)
            source = archive.extractfile(member)
            if source is None:
                raise ValueError(f"unreadable derived member: {name}")
            for raw in source:
                columns = raw.decode("utf-8").rstrip("\n").split("\t")
                if name == "tag":
                    if len(columns) >= 2 and columns[0].isdigit() and columns[1].strip():
                        tag_names[int(columns[0])] = columns[1]
                elif len(columns) >= 3 and columns[0].isdigit() and columns[1].isdigit():
                    entity = int(columns[0])
                    if entity in wanted[name]:
                        count = int(columns[2]) if columns[2].lstrip("-").isdigit() else 0
                        if count > 0:
                            votes[name][entity][int(columns[1])] += count
            if found == DERIVED_MEMBERS:
                break
    if found != DERIVED_MEMBERS:
        raise ValueError(f"derived archive missing {', '.join(sorted(DERIVED_MEMBERS - found))}")
    return votes, tag_names


def compute_mb_facts(
    core: Path, derived_archive: Path, targets: Sequence[MbTarget]
) -> tuple[dict[tuple[str, str], TrackFacts], dict[str, ArtistFacts]]:
    """Pure computation over dump files: (table, track_id) -> TrackFacts and artist_key -> ArtistFacts."""
    rows = [
        {"id": f"{t.table}:{t.track_id}", "isrc": t.isrc, "title": t.title,
         "duration_ms": t.duration_ms, "recording_mbid": t.recording_mbid}
        for t in targets
    ]
    matched, recording_credit = match_recordings_with_credits(core, rows)
    keys = {f"{t.table}:{t.track_id}": artist_key(t.artist_name) for t in targets}
    display_names: dict[str, str] = {}
    for t in targets:
        key = keys[f"{t.table}:{t.track_id}"]
        if key:
            display_names.setdefault(key, t.artist_name)

    # Artist credits of matched recordings -> credited artists.
    recording_credits = {credit for credit in recording_credit.values() if credit is not None}
    credit_members: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for columns in _rows(core / "artist_credit_name"):
        if len(columns) >= 4:
            credit, artist = _int(columns[0]), _int(columns[2])
            if credit in recording_credits and artist is not None:
                credit_members[credit].append((artist, columns[3]))
    candidate_artists = {artist for members in credit_members.values() for artist, _ in members}
    artist_rows: dict[int, tuple[str, str]] = {}
    for columns in _rows(core / "artist"):
        if len(columns) >= 3:
            artist = _int(columns[0])
            if artist in candidate_artists:
                artist_rows[artist] = (columns[1], columns[2])

    # Link a track's artist_key only to a credited artist whose credit or MB name has the same key.
    link_votes: dict[str, Counter[int]] = defaultdict(Counter)
    for row_id, (recording_id, _) in matched.items():
        key = keys[row_id]
        if not key:
            continue
        for artist, credit_name in credit_members.get(recording_credit.get(recording_id), []):
            names = {credit_name, artist_rows.get(artist, ("", ""))[1]}
            if key in {artist_key(name) for name in names if name}:
                link_votes[key][artist] += 1
    linked = {key: min(votes, key=lambda artist: (-votes[artist], artist)) for key, votes in link_votes.items()}
    linked_artists = set(linked.values())

    artists_by_credit: dict[int, set[int]] = defaultdict(set)
    if linked_artists:
        for columns in _rows(core / "artist_credit_name"):
            if len(columns) >= 3:
                credit, artist = _int(columns[0]), _int(columns[2])
                if artist in linked_artists and credit is not None:
                    artists_by_credit[credit].add(artist)

    wanted_recordings = {recording_id for recording_id, _ in matched.values()}
    mediums_by_recording: dict[int, set[int]] = defaultdict(set)
    for columns in _rows(core / "track"):
        if len(columns) >= 4:
            recording = _int(columns[2])
            if recording in wanted_recordings:
                medium = _int(columns[3])
                if medium is not None:
                    mediums_by_recording[recording].add(medium)
    wanted_mediums = set().union(*mediums_by_recording.values()) if mediums_by_recording else set()
    release_by_medium: dict[int, int] = {}
    for columns in _rows(core / "medium"):
        if len(columns) >= 2:
            medium = _int(columns[0])
            if medium in wanted_mediums:
                release = _int(columns[1])
                if release is not None:
                    release_by_medium[medium] = release
    wanted_releases = set(release_by_medium.values())
    releases: dict[int, tuple[int | None, int | None, int | None]] = {}  # id -> (credit, group, language)
    for columns in _rows(core / "release"):
        if len(columns) >= 8:
            release, credit = _int(columns[0]), _int(columns[3])
            if release is not None and (release in wanted_releases or credit in artists_by_credit):
                releases[release] = (credit, _int(columns[4]), _int(columns[7]))
    iso_codes: dict[int, str] = {}
    for columns in _rows(core / "language"):
        if len(columns) >= 7 and columns[0].isdigit() and columns[6] not in {"", "\\N"}:
            iso_codes[int(columns[0])] = columns[6]

    def language(release: int) -> str | None:
        info = releases.get(release)
        return iso_codes.get(info[2]) if info and info[2] is not None else None

    releases_by_recording = {
        recording: {release_by_medium[medium] for medium in mediums if medium in release_by_medium}
        for recording, mediums in mediums_by_recording.items()
    }
    groups_by_recording = {
        recording: {releases[r][1] for r in ids if r in releases and releases[r][1] is not None}
        for recording, ids in releases_by_recording.items()
    }
    wanted_groups = set().union(*groups_by_recording.values()) if groups_by_recording else set()
    votes, tag_names = _read_derived_tags(derived_archive, wanted_recordings, wanted_groups, linked_artists)

    track_facts: dict[tuple[str, str], TrackFacts] = {}
    for t in targets:
        row_id = f"{t.table}:{t.track_id}"
        match = matched.get(row_id)
        if match is None:
            track_facts[(t.table, t.track_id)] = TrackFacts(keys[row_id], None, None, [])
            continue
        recording_id, mbid = match
        merged: Counter[int] = Counter(votes["recording_tag"].get(recording_id, Counter()))
        for group in groups_by_recording.get(recording_id, set()):
            merged.update(votes["release_group_tag"].get(group, Counter()))
        track_facts[(t.table, t.track_id)] = TrackFacts(
            artist_key=keys[row_id],
            mb_recording_mbid=mbid,
            mb_release_language=_mode(
                (language(r) for r in releases_by_recording.get(recording_id, set())), TRACK_LANGUAGE_EXCLUDED
            ),
            mb_tags=_named(merged, tag_names),
        )

    artist_languages: dict[int, list[str | None]] = defaultdict(list)
    for release, (credit, _, _) in releases.items():
        for artist in artists_by_credit.get(credit, set()):
            artist_languages[artist].append(language(release))
    artist_facts: dict[str, ArtistFacts] = {}
    for key, display_name in display_names.items():
        artist = linked.get(key)
        if artist is None:
            artist_facts[key] = ArtistFacts(key, display_name, None, [], None)
            continue
        artist_facts[key] = ArtistFacts(
            artist_key=key,
            display_name=display_name,
            mb_artist_mbid=artist_rows[artist][0] if artist in artist_rows else None,
            mb_tags=_named(votes["artist_tag"].get(artist, Counter()), tag_names),
            mb_language=_mode(artist_languages.get(artist, []), ARTIST_LANGUAGE_EXCLUDED),
        )
    return track_facts, artist_facts


def _load_targets(connection: Any, snapshot_id: str) -> list[MbTarget]:
    ems = connection.execute(
        """SELECT t.id, t.artist, t.title, t.duration_ms,
                  COALESCE(t.mb_tag_recording_mbid, t.recording_mbid) AS recording_mbid
             FROM ems_tracks t LEFT JOIN ems_track_attributes a ON a.track_id = t.id
            WHERE t.status = 'active' AND a.mb_snapshot_id IS DISTINCT FROM %s
            ORDER BY t.id""",
        (snapshot_id,),
    ).fetchall()
    music = connection.execute(
        """SELECT m.id, m.artist_name, m.title, m.duration_ms, m.isrc, m.mb_recording_id
             FROM music_tracks m LEFT JOIN music_track_attributes a ON a.track_id = m.id
            WHERE a.mb_snapshot_id IS DISTINCT FROM %s
              AND EXISTS (SELECT 1 FROM user_playlist_tracks pt
                            JOIN user_playlists p ON p.id = pt.playlist_id
                           WHERE pt.track_id = m.id AND p.selected)
            ORDER BY m.id""",
        (snapshot_id,),
    ).fetchall()
    # EMS recordings come only from the stored mbid; user tracks fall back to isrc/title/duration matching.
    return [
        MbTarget("ems", str(row["id"]), row["artist"], row["title"], row["duration_ms"], None,
                 str(row["recording_mbid"]) if row["recording_mbid"] else None)
        for row in ems
    ] + [
        MbTarget("music", str(row["id"]), row["artist_name"], row["title"], row["duration_ms"], row["isrc"],
                 str(row["mb_recording_id"]) if row["mb_recording_id"] else None)
        for row in music
    ]


def collect_musicbrainz_attributes(core: Path, derived_archive: Path, snapshot_id: str) -> dict[str, int]:
    """Store MusicBrainz release language and tag facts for stale EMS and selected user-library tracks."""
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        targets = _load_targets(connection, snapshot_id)
        connection.commit()
        if not targets:
            return {"scanned": 0, "matched_recordings": 0, "with_language": 0, "with_tags": 0, "artists": 0}
        track_facts, artist_facts = compute_mb_facts(core, derived_archive, targets)

        artists = list(artist_facts.values())
        for offset in range(0, len(artists), 500):
            with connection.transaction():
                for artist in artists[offset:offset + 500]:
                    if artist.mb_artist_mbid is None:
                        # No MB link this run: keep any facts an earlier track already linked.
                        connection.execute(
                            """INSERT INTO music_artist_attributes (artist_key, display_name)
                               VALUES (%s, %s) ON CONFLICT (artist_key) DO NOTHING""",
                            (artist.artist_key, artist.display_name),
                        )
                        continue
                    connection.execute(
                        """INSERT INTO music_artist_attributes
                             (artist_key, display_name, mb_artist_mbid, mb_tags, mb_language, mb_snapshot_id)
                           VALUES (%s, %s, %s::uuid, %s::jsonb, %s, %s)
                           ON CONFLICT (artist_key) DO UPDATE SET
                             mb_artist_mbid = EXCLUDED.mb_artist_mbid, mb_tags = EXCLUDED.mb_tags,
                             mb_language = EXCLUDED.mb_language, mb_snapshot_id = EXCLUDED.mb_snapshot_id,
                             updated_at = now()""",
                        (artist.artist_key, artist.display_name, artist.mb_artist_mbid,
                         json.dumps(artist.mb_tags), artist.mb_language, snapshot_id),
                    )

        items = list(track_facts.items())
        for offset in range(0, len(items), 500):
            with connection.transaction():
                for (table, track_id), facts in items[offset:offset + 500]:
                    attributes = "ems_track_attributes" if table == "ems" else "music_track_attributes"
                    connection.execute(
                        f"""INSERT INTO {attributes}
                              (track_id, artist_key, mb_recording_mbid, mb_release_language, mb_tags, mb_snapshot_id)
                            VALUES (%s, %s, %s::uuid, %s, %s::jsonb, %s)
                            ON CONFLICT (track_id) DO UPDATE SET
                              artist_key = EXCLUDED.artist_key, mb_recording_mbid = EXCLUDED.mb_recording_mbid,
                              mb_release_language = EXCLUDED.mb_release_language, mb_tags = EXCLUDED.mb_tags,
                              mb_snapshot_id = EXCLUDED.mb_snapshot_id""",
                        (track_id, facts.artist_key, facts.mb_recording_mbid, facts.mb_release_language,
                         json.dumps(facts.mb_tags), snapshot_id),
                    )
    facts = list(track_facts.values())
    return {
        "scanned": len(targets),
        "matched_recordings": sum(1 for item in facts if item.mb_recording_mbid),
        "with_language": sum(1 for item in facts if item.mb_release_language),
        "with_tags": sum(1 for item in facts if item.mb_tags),
        "artists": len(artist_facts),
    }
