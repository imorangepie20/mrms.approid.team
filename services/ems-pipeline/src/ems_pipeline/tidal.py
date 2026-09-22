from __future__ import annotations

import base64
import hashlib
import re
import time
import unicodedata
from dataclasses import dataclass
from enum import Enum
from typing import Any

import httpx

from .select import Candidate


class ResolveStatus(str, Enum):
    MATCHED = "matched"
    AMBIGUOUS = "ambiguous"
    NOT_FOUND = "not_found"
    UNAVAILABLE = "unavailable"
    RETRYABLE = "retryable"
    BUDGET_EXHAUSTED = "budget_exhausted"


@dataclass(frozen=True)
class ResolveResult:
    status: ResolveStatus
    tidal_id: str | None = None
    match_rule: str | None = None
    match_confidence: float = 0.0
    query_hash: str | None = None
    retry_after_seconds: int | None = None
    error_code: str | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    duration_ms: int | None = None
    artwork_url: str | None = None


@dataclass(frozen=True)
class _Track:
    id: str
    title: str
    artist: str
    album: str
    isrc: str | None
    duration_ms: int | None
    availability: list[Any]
    artwork_url: str | None


def normalize(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    ascii_value = decomposed.encode("ascii", "ignore").decode("ascii")
    ascii_value = re.sub(r"[\[\](){}]", " ", ascii_value)
    return re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()


def duration_milliseconds(value: Any) -> int | None:
    if isinstance(value, (int, float)):
        return int(value)
    if not isinstance(value, str):
        return None
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", value)
    if not match:
        return None
    return round((int(match.group(1) or 0) * 3600 + int(match.group(2) or 0) * 60 + float(match.group(3) or 0)) * 1000)


def _resources(document: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    values = []
    values.extend(item for item in document.get("included", []) if isinstance(item, dict))
    values.extend(item for item in document.get("data", []) if isinstance(item, dict) and "attributes" in item)
    return {(str(item.get("type")), str(item.get("id"))): item for item in values}


def _artwork_url(album: dict[str, Any], resources: dict[tuple[str, str], dict[str, Any]]) -> str | None:
    cover_refs = ((album.get("relationships") or {}).get("coverArt") or {}).get("data", [])
    if not isinstance(cover_refs, list):
        cover_refs = [cover_refs]
    cover_ref = next((item for item in cover_refs if isinstance(item, dict)), None)
    if cover_ref is None:
        return None
    artwork = resources.get((str(cover_ref.get("type")), str(cover_ref.get("id"))), {})
    files = (artwork.get("attributes") or {}).get("files", [])
    if not isinstance(files, list):
        return None
    candidates = [item for item in files if isinstance(item, dict) and isinstance(item.get("href"), str)]
    if not candidates:
        return None
    chosen = max(
        candidates,
        key=lambda item: int((item.get("meta") or {}).get("width") or 0) * int((item.get("meta") or {}).get("height") or 0),
    )
    return str(chosen["href"])


def parse_tracks(document: dict[str, Any]) -> list[_Track]:
    resources = _resources(document)
    references = [item for item in document.get("data", []) if isinstance(item, dict) and item.get("type") == "tracks"]
    if not references:
        references = [
            item
            for search_result in document.get("data", [])
            if isinstance(search_result, dict) and search_result.get("type") == "searchResults"
            for item in ((search_result.get("relationships") or {}).get("tracks") or {}).get("data", [])
            if isinstance(item, dict)
        ]
    tracks: list[_Track] = []
    for reference in references:
        track = resources.get(("tracks", str(reference.get("id"))))
        if not track:
            continue
        attributes = track.get("attributes") if isinstance(track.get("attributes"), dict) else {}
        artist_ref = ((track.get("relationships") or {}).get("artists") or {}).get("data", [])
        album_ref = ((track.get("relationships") or {}).get("albums") or {}).get("data", [])
        artist_identifier = artist_ref[0] if isinstance(artist_ref, list) and artist_ref else {}
        album_identifier = album_ref[0] if isinstance(album_ref, list) and album_ref else {}
        artist_resource = resources.get((str(artist_identifier.get("type")), str(artist_identifier.get("id"))), {})
        album_resource = resources.get((str(album_identifier.get("type")), str(album_identifier.get("id"))), {})
        artist_attributes = artist_resource.get("attributes") if isinstance(artist_resource.get("attributes"), dict) else {}
        album_attributes = album_resource.get("attributes") if isinstance(album_resource.get("attributes"), dict) else {}
        availability = attributes.get("availability", [])
        if not isinstance(availability, list):
            availability = []
        tracks.append(_Track(
            id=str(reference.get("id")),
            title=str(attributes.get("title") or ""),
            artist=str(artist_attributes.get("name") or attributes.get("artistName") or ""),
            album=str(album_attributes.get("title") or attributes.get("albumTitle") or ""),
            isrc=str(attributes["isrc"]) if attributes.get("isrc") else None,
            duration_ms=duration_milliseconds(attributes.get("duration")),
            availability=[item for item in availability if isinstance(item, (dict, str))],
            artwork_url=_artwork_url(album_resource, resources),
        ))
    return tracks


class TidalCatalogClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        token_url: str = "https://auth.tidal.com/v1/oauth2/token",
        api_base_url: str = "https://openapi.tidal.com/v2",
        country_code: str = "KR",
        request_budget: int = 1000,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.client_id = client_id
        self.client_secret = client_secret
        self.token_url = token_url
        self.api_base_url = api_base_url.rstrip("/")
        self.country_code = country_code
        self.request_budget = max(0, request_budget)
        self.used_requests = 0
        self.http_client = http_client or httpx.Client(timeout=30)
        self._token: str | None = None
        self._token_expires_at = 0.0

    def get_token(self, force_refresh: bool = False) -> str:
        if self._token and not force_refresh and time.time() < self._token_expires_at - 30:
            return self._token
        encoded = base64.b64encode(f"{self.client_id}:{self.client_secret}".encode()).decode()
        response = self.http_client.post(
            self.token_url,
            headers={"Authorization": f"Basic {encoded}", "Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials"},
        )
        if response.status_code >= 400:
            raise httpx.HTTPStatusError("token request failed", request=response.request, response=response)
        payload = response.json()
        token = payload.get("access_token")
        if not isinstance(token, str) or not token:
            raise ValueError("token response missing access_token")
        self._token = token
        self._token_expires_at = time.time() + int(payload.get("expires_in", 3600))
        return token

    def resolve(self, candidate: Candidate) -> ResolveResult:
        # TIDAL search treats a full artist/title/album string as one strict query.
        # Album editions often differ, so discover by artist + title only.
        query = " ".join(value for value in (candidate.artist, candidate.title) if value)
        query_hash = hashlib.sha256(query.encode("utf-8")).hexdigest()
        if self.used_requests >= self.request_budget:
            return ResolveResult(ResolveStatus.BUDGET_EXHAUSTED, query_hash=query_hash, error_code="daily_budget")
        try:
            token = self.get_token()
        except (httpx.HTTPError, ValueError):
            return ResolveResult(ResolveStatus.RETRYABLE, query_hash=query_hash, error_code="token_request")

        def request(url: str, params: dict[str, str]) -> httpx.Response | ResolveResult:
            nonlocal token
            response = self.http_client.get(url, params=params, headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"})
            if response.status_code == 401:
                try:
                    token = self.get_token(force_refresh=True)
                except (httpx.HTTPError, ValueError):
                    return ResolveResult(ResolveStatus.RETRYABLE, query_hash=query_hash, error_code="token_refresh")
                response = self.http_client.get(url, params=params, headers={"Authorization": f"Bearer {token}", "accept": "application/vnd.api+json"})
            self.used_requests += 1
            return response

        def response_error(response: httpx.Response) -> ResolveResult | None:
            if response.status_code == 429:
                retry_after = response.headers.get("Retry-After")
                try:
                    retry_seconds = max(0, min(3600, int(float(retry_after)))) if retry_after else None
                except ValueError:
                    retry_seconds = None
                return ResolveResult(ResolveStatus.RETRYABLE, query_hash=query_hash, retry_after_seconds=retry_seconds, error_code="rate_limited")
            if response.status_code >= 500:
                return ResolveResult(ResolveStatus.RETRYABLE, query_hash=query_hash, error_code="upstream_5xx")
            return None

        if candidate.isrc:
            direct = request(
                f"{self.api_base_url}/tracks",
                {"filter[isrc]": candidate.isrc, "countryCode": self.country_code, "include": "artists,albums,albums.coverArt"},
            )
            if isinstance(direct, ResolveResult):
                return direct
            direct_error = response_error(direct)
            if direct_error:
                return direct_error
            if direct.status_code < 400:
                try:
                    direct_tracks = parse_tracks(direct.json())
                except (TypeError, ValueError):
                    direct_tracks = []
                exact_isrc = [track for track in direct_tracks if track.isrc and track.isrc.upper() == candidate.isrc.upper()]
                if exact_isrc:
                    match = _choose_best_match(candidate, exact_isrc, self.country_code)
                    rule = "isrc_exact_tiebreak" if len(exact_isrc) > 1 else "isrc_exact"
                    return _validated_match(candidate, match, query_hash, rule, 1.0, self.country_code)
            if self.used_requests >= self.request_budget:
                return ResolveResult(ResolveStatus.BUDGET_EXHAUSTED, query_hash=query_hash, error_code="daily_budget")

        response = request(
            f"{self.api_base_url}/searchResults",
            {"filter[query]": query, "countryCode": self.country_code, "include": "tracks,tracks.artists,tracks.albums,tracks.albums.coverArt"},
        )
        if isinstance(response, ResolveResult):
            return response
        error = response_error(response)
        if error:
            return error
        if response.status_code >= 400:
            return ResolveResult(ResolveStatus.NOT_FOUND, query_hash=query_hash, error_code="catalog_http")
        try:
            tracks = parse_tracks(response.json())
        except (TypeError, ValueError):
            return ResolveResult(ResolveStatus.RETRYABLE, query_hash=query_hash, error_code="invalid_response")
        exact_isrc = [track for track in tracks if candidate.isrc and track.isrc and track.isrc.upper() == candidate.isrc.upper()]
        if exact_isrc:
            matches = exact_isrc
            rule = "isrc_exact"
            confidence = 1.0
        else:
            matches = [track for track in tracks if normalize(track.title) == normalize(candidate.title) and normalize(track.artist) == normalize(candidate.artist) and _duration_matches(candidate.duration_ms, track.duration_ms)]
            rule = "metadata_exact_duration"
            confidence = 0.95
        if not matches:
            return ResolveResult(ResolveStatus.NOT_FOUND, query_hash=query_hash, error_code="no_match")
        match = _choose_best_match(candidate, matches, self.country_code)
        if len(matches) > 1:
            rule = f"{rule}_tiebreak"
        return _validated_match(candidate, match, query_hash, rule, confidence, self.country_code)


def _duration_matches(left: int | None, right: int | None) -> bool:
    return left is None or right is None or abs(left - right) <= 2_000


def _choose_best_match(candidate: Candidate, matches: list[_Track], country_code: str) -> _Track:
    """Choose one equivalent catalog edition without depending on API result order."""
    def rank(match: _Track) -> tuple[int, int, int, int, str]:
        duration_delta = abs(candidate.duration_ms - match.duration_ms) if candidate.duration_ms is not None and match.duration_ms is not None else 10**9
        return (
            -int(_has_stream_availability(match.availability, country_code)),
            -int(normalize(match.title) == normalize(candidate.title) and normalize(match.artist) == normalize(candidate.artist)),
            duration_delta,
            -int(bool(candidate.album) and normalize(match.album) == normalize(candidate.album)),
            match.id,
        )

    return min(matches, key=rank)


def _validated_match(candidate: Candidate, match: _Track, query_hash: str, rule: str, confidence: float, country_code: str) -> ResolveResult:
    resolved = {
        "tidal_id": match.id,
        "query_hash": query_hash,
        "match_rule": rule,
        "match_confidence": confidence,
        "title": match.title,
        "artist": match.artist,
        "album": match.album,
        "duration_ms": match.duration_ms,
        "artwork_url": match.artwork_url,
    }
    if not _has_stream_availability(match.availability, country_code):
        return ResolveResult(ResolveStatus.UNAVAILABLE, error_code="kr_stream_missing", **resolved)
    if match.duration_ms is not None and match.duration_ms < 30_000:
        return ResolveResult(ResolveStatus.UNAVAILABLE, error_code="duration_too_short", **resolved)
    return ResolveResult(ResolveStatus.MATCHED, **resolved)


def _has_stream_availability(availability: list[Any], country_code: str) -> bool:
    for item in availability:
        if isinstance(item, str) and item == "STREAM":
            return True
        if isinstance(item, dict) and item.get("countryCode") == country_code and item.get("type") == "STREAM":
            return True
    return False
