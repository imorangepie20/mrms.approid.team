from __future__ import annotations

import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlsplit

import httpx

from .select import Candidate, write_candidate_artifacts
from .tidal import TidalCatalogClient, duration_milliseconds


DEFAULT_QUERIES = ("Top 100", "Hits", "Pop", "K-Pop", "Hip-Hop", "R&B", "Rock", "Dance", "Latin", "Country", "Jazz", "Classical")


@dataclass(frozen=True)
class EditorialPlaylist:
    playlist_id: str
    name: str
    followers: int


@dataclass(frozen=True)
class EditorialTrack:
    tidal_id: str
    isrc: str
    title: str
    artist: str
    album: str
    duration_ms: int
    popularity: float
    playlist_followers: int


def rank_editorial_playlists(documents: Iterable[dict[str, Any]]) -> list[EditorialPlaylist]:
    playlists: dict[str, EditorialPlaylist] = {}
    for document in documents:
        for item in document.get("included", []):
            if not isinstance(item, dict) or item.get("type") != "playlists":
                continue
            attributes = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
            if attributes.get("playlistType") != "EDITORIAL" or attributes.get("accessType") != "PUBLIC":
                continue
            if int(attributes.get("numberOfTrackItems") or 0) < 20:
                continue
            playlist_id = str(item.get("id") or "")
            if not playlist_id:
                continue
            playlists[playlist_id] = EditorialPlaylist(
                playlist_id=playlist_id,
                name=str(attributes.get("name") or "Untitled playlist"),
                followers=max(0, int(attributes.get("numberOfFollowers") or 0)),
            )
    return sorted(playlists.values(), key=lambda item: (-item.followers, item.playlist_id))


def _selection_score(group: list[EditorialTrack]) -> float:
    popularity = max(item.popularity for item in group)
    repeat_bonus = min(0.15, 0.03 * (len(group) - 1))
    follower_bonus = min(0.1, math.log10(1 + max(item.playlist_followers for item in group)) / 60)
    return min(1.0, popularity + repeat_bonus + follower_bonus)


def select_editorial_candidates(tracks: Iterable[EditorialTrack], limit: int) -> list[Candidate]:
    if limit < 0:
        raise ValueError("limit must be non-negative")
    grouped: dict[str, list[EditorialTrack]] = {}
    for track in tracks:
        if not track.isrc.strip() or not track.title.strip() or not track.artist.strip() or track.duration_ms < 30_000:
            continue
        grouped.setdefault(track.isrc.upper(), []).append(track)

    ranked: list[tuple[float, EditorialTrack]] = []
    for group in grouped.values():
        chosen = min(group, key=lambda item: (-item.popularity, -item.playlist_followers, item.tidal_id))
        ranked.append((_selection_score(group), chosen))
    ranked.sort(key=lambda item: (-item[0], item[1].isrc.upper(), item[1].tidal_id))

    selected: list[Candidate] = []
    artist_counts: dict[str, int] = {}
    album_counts: dict[str, int] = {}
    for score, track in ranked:
        artist_key = track.artist.casefold()
        album_key = track.album.casefold()
        if artist_counts.get(artist_key, 0) >= 5 or album_counts.get(album_key, 0) >= 5:
            continue
        normalized_isrc = track.isrc.upper()
        selected.append(Candidate(
            candidate_key=f"tidal:{track.tidal_id}:{normalized_isrc}",
            recording_mbid=None,
            isrc=normalized_isrc,
            title=track.title,
            artist=track.artist,
            album=track.album or None,
            duration_ms=track.duration_ms,
            release_date=None,
            artist_region=None,
            selection_bucket="canonical",
            selection_score=score,
        ))
        artist_counts[artist_key] = artist_counts.get(artist_key, 0) + 1
        album_counts[album_key] = album_counts.get(album_key, 0) + 1
        if len(selected) == limit:
            break
    return selected


def _get_document(client: TidalCatalogClient, token: str, url: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    response: httpx.Response | None = None
    for attempt in range(5):
        response = client.http_client.get(url, params=params, headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"})
        if response.status_code != 429 and response.status_code < 500:
            response.raise_for_status()
            document = response.json()
            if not isinstance(document, dict):
                raise ValueError("invalid TIDAL response")
            return document
        retry_after = response.headers.get("Retry-After")
        try:
            delay = float(retry_after) if retry_after else 2**attempt
        except ValueError:
            delay = 2**attempt
        time.sleep(max(0.0, min(8.0, delay)))
    assert response is not None
    response.raise_for_status()
    raise RuntimeError("unreachable")


def resolve_next_page_url(api_base_url: str, next_url: str, visited: set[str], *, page_count: int) -> str:
    if page_count >= 100:
        raise ValueError("TIDAL pagination page limit exceeded")
    resolved = urljoin(f"{api_base_url.rstrip('/')}/", next_url.lstrip("/"))
    base = urlsplit(api_base_url)
    target = urlsplit(resolved)
    if target.scheme != "https" or (target.scheme, target.netloc) != (base.scheme, base.netloc):
        raise ValueError("TIDAL pagination origin mismatch")
    if resolved in visited:
        raise ValueError("repeated TIDAL pagination URL")
    visited.add(resolved)
    return resolved


def _parse_editorial_tracks(document: dict[str, Any], playlist_followers: int) -> list[EditorialTrack]:
    resources = {
        (str(item.get("type")), str(item.get("id"))): item
        for item in document.get("included", [])
        if isinstance(item, dict)
    }
    tracks: list[EditorialTrack] = []
    for reference in document.get("data", []):
        if not isinstance(reference, dict) or reference.get("type") != "tracks":
            continue
        resource = resources.get(("tracks", str(reference.get("id"))))
        if not resource:
            continue
        attributes = resource.get("attributes") if isinstance(resource.get("attributes"), dict) else {}
        availability = attributes.get("availability") if isinstance(attributes.get("availability"), list) else []
        if "STREAM" not in availability:
            continue
        relationships = resource.get("relationships") if isinstance(resource.get("relationships"), dict) else {}
        artist_refs = ((relationships.get("artists") or {}).get("data") or [])
        album_refs = ((relationships.get("albums") or {}).get("data") or [])
        artists = [
            str((resources.get((str(item.get("type")), str(item.get("id"))), {}).get("attributes") or {}).get("name") or "")
            for item in artist_refs if isinstance(item, dict)
        ]
        album_ref = album_refs[0] if isinstance(album_refs, list) and album_refs and isinstance(album_refs[0], dict) else {}
        album_resource = resources.get((str(album_ref.get("type")), str(album_ref.get("id"))), {})
        duration_ms = duration_milliseconds(attributes.get("duration"))
        isrc = str(attributes.get("isrc") or "")
        if not isrc or duration_ms is None:
            continue
        tracks.append(EditorialTrack(
            tidal_id=str(reference.get("id")),
            isrc=isrc,
            title=str(attributes.get("title") or ""),
            artist=", ".join(value for value in artists if value),
            album=str((album_resource.get("attributes") or {}).get("title") or ""),
            duration_ms=duration_ms,
            popularity=max(0.0, min(1.0, float(attributes.get("popularity") or 0.0))),
            playlist_followers=playlist_followers,
        ))
    return tracks


def build_tidal_editorial_snapshot(
    *,
    client_id: str,
    client_secret: str,
    work_root: Path,
    snapshot_id: str,
    limit: int = 1000,
    playlist_limit: int = 40,
) -> tuple[Path, Path]:
    client = TidalCatalogClient(client_id, client_secret)
    token = client.get_token()
    search_documents = [
        _get_document(client, token, f"{client.api_base_url}/searchResults", {"filter[query]": query, "countryCode": client.country_code, "include": "playlists"})
        for query in DEFAULT_QUERIES
    ]
    playlists = rank_editorial_playlists(search_documents)[:playlist_limit]
    tracks: list[EditorialTrack] = []
    for playlist in playlists:
        url = f"{client.api_base_url}/playlists/{playlist.playlist_id}/relationships/items"
        params: dict[str, str] | None = {"countryCode": client.country_code, "include": "items,items.albums,items.artists"}
        visited_pages = {url}
        page_count = 0
        while url:
            page_count += 1
            document = _get_document(client, token, url, params)
            tracks.extend(_parse_editorial_tracks(document, playlist.followers))
            next_url = (document.get("links") or {}).get("next")
            url = resolve_next_page_url(client.api_base_url, str(next_url), visited_pages, page_count=page_count) if next_url else ""
            params = None

    selected = select_editorial_candidates(tracks, limit)
    if len(selected) != limit:
        raise ValueError(f"TIDAL editorial source produced {len(selected)} candidates; expected {limit}")
    return write_candidate_artifacts(
        selected,
        work_root / snapshot_id / "candidates",
        snapshot_id,
        seed=17,
        selector_version="ems-tidal-editorial-v1",
        source_license="tidal-authorized-use",
    )
