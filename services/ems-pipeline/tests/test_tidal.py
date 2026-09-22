from datetime import datetime, timezone

import httpx

from ems_pipeline.select import Candidate
from ems_pipeline.tidal import ResolveStatus, TidalCatalogClient


def candidate(**overrides: object) -> Candidate:
    values: dict[str, object] = {
        "candidate_key": "mbid-a:ISRC-A",
        "recording_mbid": "mbid-a",
        "isrc": "ISRC-A",
        "title": "One More Time",
        "artist": "Daft Punk",
        "album": "Discovery",
        "duration_ms": 31000,
        "release_date": "2001-01-01",
        "artist_region": "FR",
        "selection_bucket": "canonical",
        "selection_score": 0.9,
    }
    values.update(overrides)
    return Candidate(**values)  # type: ignore[arg-type]


def token_response() -> httpx.Response:
    return httpx.Response(200, json={"access_token": "token-a", "expires_in": 3600})


def track(track_id: str, *, isrc: str | None = "ISRC-A", title: str = "One More Time", availability: list[dict[str, str]] | None = None) -> dict[str, object]:
    return {
        "type": "tracks",
        "id": track_id,
        "attributes": {
            "title": title,
            "isrc": isrc,
            "duration": "PT31S",
            "availability": availability or [{"countryCode": "KR", "type": "STREAM"}],
        },
        "relationships": {"artists": {"data": [{"type": "artists", "id": "artist-a"}]}, "albums": {"data": [{"type": "albums", "id": "album-a"}]}},
    }


def search_document(tracks: list[dict[str, object]]) -> dict[str, object]:
    return {
        "data": [{"type": "tracks", "id": item["id"]} for item in tracks],
        "included": tracks + [
            {"type": "artists", "id": "artist-a", "attributes": {"name": "Daft Punk"}},
            {"type": "albums", "id": "album-a", "attributes": {"title": "Discovery"}},
        ],
    }


def search_results_document(tracks: list[dict[str, object]]) -> dict[str, object]:
    return {
        "data": [{
            "type": "searchResults",
            "id": "search-a",
            "relationships": {"tracks": {"data": [{"type": "tracks", "id": item["id"]} for item in tracks]}},
        }],
        "included": tracks + [
            {"type": "artists", "id": "artist-a", "attributes": {"name": "Daft Punk"}},
            {"type": "albums", "id": "album-a", "attributes": {"title": "Discovery"}},
        ],
    }


def test_v2_search_results_uses_filter_query_and_country_filtered_stream_availability() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        assert request.url.path == "/v2/searchResults"
        assert request.url.params.get("filter[query]") == "Daft Punk One More Time Discovery"
        assert request.url.params.get("include") == "tracks,tracks.artists,tracks.albums"
        assert request.url.params.get("countryCode") == "KR"
        return httpx.Response(200, json=search_results_document([track("tidal-a", availability=["STREAM", "DJ"])]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    assert client.resolve(candidate()).status is ResolveStatus.MATCHED


def test_isrc_exact_match_wins_and_records_only_query_hash() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a")]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())

    assert result.status is ResolveStatus.MATCHED
    assert result.tidal_id == "tidal-a"
    assert result.match_rule == "isrc_exact"
    assert result.query_hash and "One%20More" not in result.query_hash
    assert all("secret" not in str(request.content) for request in requests)


def test_fallback_requires_exact_metadata_and_duration() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a", isrc=None)]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate(isrc=None))

    assert result.status is ResolveStatus.MATCHED
    assert result.match_rule == "metadata_exact_duration"


def test_tie_is_quarantined_as_ambiguous() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a"), track("tidal-b")]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    assert client.resolve(candidate()).status is ResolveStatus.AMBIGUOUS


def test_kr_stream_failure_is_unavailable() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a", availability=[{"countryCode": "US", "type": "STREAM"}])]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    assert client.resolve(candidate()).status is ResolveStatus.UNAVAILABLE


def test_429_returns_retryable_and_respects_budget() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(429, headers={"Retry-After": "7"})

    client = TidalCatalogClient("client", "secret", request_budget=1, http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())
    assert result.status is ResolveStatus.RETRYABLE
    assert result.retry_after_seconds == 7
    assert client.resolve(candidate(candidate_key="mbid-b:ISRC-B", recording_mbid="mbid-b", isrc="ISRC-B")).status is ResolveStatus.BUDGET_EXHAUSTED
    assert calls == 2
