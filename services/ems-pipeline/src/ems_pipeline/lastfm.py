"""Last.fm artist top tags (non-commercial use): stores only artist name + tag name/count."""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Literal

import httpx
import psycopg
from psycopg.rows import dict_row

API_URL = "https://ws.audioscrobbler.com/2.0/"
USER_AGENT = "music-pie-ems/0.1 (https://mrms.approid.team)"
MAX_TAGS = 10
MAX_RETRIES = 4
RATE_LIMIT_ERROR = 29
NOT_FOUND_ERROR = 6
# 11 service offline, 16 temporary error, 29 rate limit: retry with backoff.
RETRYABLE_ERRORS = frozenset({11, 16, RATE_LIMIT_ERROR})
# 10 invalid API key, 26 suspended API key: every further request would fail too.
KEY_INVALID_ERRORS = frozenset({10, 26})
MAX_RETRY_AFTER_SECONDS = 120.0
MAX_CONSECUTIVE_FAILURES = 10
TIME_BUDGET_SECONDS = 20 * 60

StoppedReason = Literal["consecutive_failures", "time_budget", "key_invalid"]


class LastfmKeyInvalidError(RuntimeError):
    """The API key was rejected (Last.fm error 10/26). The message never contains the key."""

    def __init__(self, code: int) -> None:
        super().__init__(f"lastfm_key_invalid (lastfm_{code})")
        self.code = code


@dataclass(frozen=True)
class LastfmResult:
    status: Literal["ok", "not_found", "failed"]
    tags: list[tuple[str, int]] = field(default_factory=list)
    error_code: str | None = None


def _parse_tags(payload: dict[str, Any]) -> list[tuple[str, int]]:
    toptags = payload.get("toptags")
    raw = toptags.get("tag") if isinstance(toptags, dict) else None
    if isinstance(raw, dict):
        raw = [raw]
    if not isinstance(raw, list):
        return []
    tags: list[tuple[str, int]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        try:
            count = int(item.get("count"))
        except (TypeError, ValueError):
            continue
        if name and count > 0:
            tags.append((name, count))
    return tags[:MAX_TAGS]


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("Retry-After")
    if raw is None:
        return None
    try:
        seconds = float(raw.strip())
    except ValueError:
        return None  # HTTP-date form is not used by Last.fm; fall back to backoff.
    if seconds < 0:
        return None
    return min(seconds, MAX_RETRY_AFTER_SECONDS)


class LastfmClient:
    def __init__(
        self,
        api_key: str,
        http_client: httpx.Client,
        min_interval_seconds: float = 1.0,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._api_key = api_key
        self._http = http_client
        self._min_interval = min_interval_seconds
        self._clock = clock
        self._sleep = sleep
        self._last_request: float | None = None

    def _throttle(self) -> None:
        if self._last_request is not None:
            wait = self._min_interval - (self._clock() - self._last_request)
            if wait > 0:
                self._sleep(wait)
        self._last_request = self._clock()

    def top_tags(self, artist_name: str) -> LastfmResult:
        params = {"method": "artist.gettoptags", "artist": artist_name, "autocorrect": "1",
                  "api_key": self._api_key, "format": "json"}
        error_code = "request_failed"
        retry_after: float | None = None
        for attempt in range(MAX_RETRIES + 1):
            if attempt:
                self._sleep(retry_after if retry_after is not None else 2 ** (attempt - 1))
            retry_after = None
            self._throttle()
            try:
                response = self._http.get(API_URL, params=params)
            except httpx.RequestError as exc:
                # Exception text may embed the request URL (and the key); keep only the class name.
                error_code = f"request_{type(exc).__name__}"
                continue
            if response.status_code == 429 or response.status_code >= 500:
                error_code = f"http_{response.status_code}"
                if response.status_code == 429:
                    retry_after = _retry_after_seconds(response)
                continue
            if response.status_code >= 400:
                return LastfmResult("failed", [], f"http_{response.status_code}")
            try:
                payload = response.json()
            except ValueError:
                return LastfmResult("failed", [], "invalid_json")
            if not isinstance(payload, dict):
                return LastfmResult("failed", [], "invalid_response")
            if "error" in payload:
                try:
                    code = int(payload["error"])
                except (TypeError, ValueError):
                    return LastfmResult("failed", [], "lastfm_error")
                if code == NOT_FOUND_ERROR:
                    return LastfmResult("not_found", [], None)
                if code in KEY_INVALID_ERRORS:
                    raise LastfmKeyInvalidError(code)
                if code in RETRYABLE_ERRORS:
                    error_code = f"lastfm_{code}"
                    continue
                return LastfmResult("failed", [], f"lastfm_{code}")
            return LastfmResult("ok", _parse_tags(payload), None)
        return LastfmResult("failed", [], error_code)


def run_lastfm_batch(
    client: LastfmClient,
    artists: Iterable[dict[str, Any]],
    record: Callable[[dict[str, Any], LastfmResult], None],
    *,
    clock: Callable[[], float] = time.monotonic,
    max_consecutive_failures: int = MAX_CONSECUTIVE_FAILURES,
    time_budget_seconds: float = TIME_BUDGET_SECONDS,
) -> dict[str, Any]:
    """Fetch tags artist by artist with a circuit breaker so an outage cannot stall the routine loop.

    Stops after ``max_consecutive_failures`` failed results in a row, once the wall-clock budget is
    spent, or immediately when Last.fm rejects the API key (that artist is left untouched).
    """
    counts: dict[str, Any] = {"requested": 0, "ok": 0, "not_found": 0, "failed": 0, "stopped_reason": None}
    started = clock()
    consecutive_failures = 0
    for artist in artists:
        if clock() - started >= time_budget_seconds:
            counts["stopped_reason"] = "time_budget"
            break
        try:
            result = client.top_tags(artist["display_name"])
        except LastfmKeyInvalidError:
            counts["stopped_reason"] = "key_invalid"
            break
        counts["requested"] += 1
        counts[result.status] += 1
        record(artist, result)
        consecutive_failures = consecutive_failures + 1 if result.status == "failed" else 0
        if consecutive_failures >= max_consecutive_failures:
            counts["stopped_reason"] = "consecutive_failures"
            break
    return counts


def fetch_lastfm_artist_tags(
    limit: int = 3000, stale_days: int = 90, *, clock: Callable[[], float] = time.monotonic
) -> dict[str, Any]:
    """Fetch Last.fm top tags for pending, stale, or retry-eligible failed artists.

    Returns requested/ok/not_found/failed counts plus ``stopped_reason`` (None when the batch finished).
    """
    api_key = os.environ.get("LASTFM_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("LASTFM_API_KEY missing")
    with psycopg.connect(os.environ["DATABASE_URL"], row_factory=dict_row) as connection:
        artists = connection.execute(
            """SELECT artist_key, display_name FROM music_artist_attributes
                WHERE lastfm_status = 'pending'
                   OR lastfm_fetched_at < now() - make_interval(days => %s)
                   OR (lastfm_status = 'failed' AND lastfm_fetched_at < now() - interval '24 hours')
                ORDER BY lastfm_fetched_at NULLS FIRST, artist_key
                LIMIT %s""",
            (stale_days, limit),
        ).fetchall()
        connection.commit()
        with httpx.Client(timeout=30, headers={"User-Agent": USER_AGENT}) as http:
            client = LastfmClient(api_key, http, clock=clock)

            def record(artist: dict[str, Any], result: LastfmResult) -> None:
                tags = [{"name": name, "count": count} for name, count in result.tags]
                with connection.transaction():
                    connection.execute(
                        """UPDATE music_artist_attributes
                              SET lastfm_tags = CASE WHEN %s = 'failed' THEN lastfm_tags ELSE %s::jsonb END, lastfm_status = %s, lastfm_error_code = %s,
                                  lastfm_fetched_at = now(), updated_at = now()
                            WHERE artist_key = %s""",
                        (result.status, json.dumps(tags), result.status, result.error_code, artist["artist_key"]),
                    )

            counts = run_lastfm_batch(client, artists, record, clock=clock)
    return counts
