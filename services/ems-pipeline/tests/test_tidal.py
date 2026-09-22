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


def track(track_id: str, *, isrc: str | None = "ISRC-A", title: str = "One More Time", duration: str = "PT31S", availability: list[dict[str, str]] | None = None) -> dict[str, object]:
    return {
        "type": "tracks",
        "id": track_id,
        "attributes": {
            "title": title,
            "isrc": isrc,
            "duration": duration,
            "availability": availability or [{"countryCode": "KR", "type": "STREAM"}],
        },
        "relationships": {"artists": {"data": [{"type": "artists", "id": "artist-a"}]}, "albums": {"data": [{"type": "albums", "id": "album-a"}]}},
    }


def search_document(tracks: list[dict[str, object]], *, with_artwork: bool = False) -> dict[str, object]:
    album = {"type": "albums", "id": "album-a", "attributes": {"title": "Discovery"}}
    included: list[dict[str, object]] = tracks + [
        {"type": "artists", "id": "artist-a", "attributes": {"name": "Daft Punk"}},
        album,
    ]
    if with_artwork:
        album["relationships"] = {"coverArt": {"data": [{"type": "artworks", "id": "art-a"}]}}
        included.append({
            "type": "artworks",
            "id": "art-a",
            "attributes": {"files": [
                {"href": "https://resources.tidal.com/320.jpg", "meta": {"width": 320, "height": 320}},
                {"href": "https://resources.tidal.com/1280.jpg", "meta": {"width": 1280, "height": 1280}},
            ]},
        })
    return {
        "data": [{"type": "tracks", "id": item["id"]} for item in tracks],
        "included": included,
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
        assert request.url.params.get("filter[query]") == "Daft Punk One More Time"
        assert request.url.params.get("include") == "tracks,tracks.artists,tracks.albums,tracks.albums.coverArt"
        assert request.url.params.get("countryCode") == "KR"
        return httpx.Response(200, json=search_results_document([track("tidal-a", availability=["STREAM", "DJ"])]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    assert client.resolve(candidate(isrc=None)).status is ResolveStatus.MATCHED


def test_isrc_lookup_uses_tracks_filter_before_search() -> None:
    api_calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        api_calls.append(request.url.path)
        assert request.url.path == "/v2/tracks"
        assert request.url.params.get("filter[isrc]") == "ISRC-A"
        assert request.url.params.get("include") == "artists,albums,albums.coverArt"
        return httpx.Response(200, json=search_document([track("tidal-a")]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    assert client.resolve(candidate()).status is ResolveStatus.MATCHED
    assert api_calls == ["/v2/tracks"]


def test_isrc_duplicate_prefers_title_artist_metadata() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([
            track("tidal-other", title="One More Night"),
            track("tidal-exact"),
        ]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())

    assert result.status is ResolveStatus.MATCHED
    assert result.tidal_id == "tidal-exact"


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


def test_resolver_returns_the_largest_album_artwork() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a")], with_artwork=True))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")

    assert client.resolve(candidate()).artwork_url == "https://resources.tidal.com/1280.jpg"


def test_fallback_requires_exact_metadata_and_duration() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a", isrc=None)]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate(isrc=None))

    assert result.status is ResolveStatus.MATCHED
    assert result.match_rule == "metadata_exact_duration"


def test_album_variant_does_not_block_unique_title_artist_duration_match() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-a", isrc=None)]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate(isrc=None, album="Discovery (Deluxe Edition)"))

    assert result.status is ResolveStatus.MATCHED
    assert result.match_rule == "metadata_exact_duration"


def test_duplicate_editions_prefer_streamable_match() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([
            track("tidal-unavailable", availability=[{"countryCode": "US", "type": "STREAM"}]),
            track("tidal-streamable"),
        ]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())

    assert result.status is ResolveStatus.MATCHED
    assert result.tidal_id == "tidal-streamable"
    assert result.match_rule == "isrc_exact_tiebreak"
    assert result.title == "One More Time"
    assert result.duration_ms == 31_000


def test_duplicate_editions_prefer_streamable_match_before_duration_delta() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([
            track("tidal-unavailable", availability=[{"countryCode": "US", "type": "STREAM"}]),
            track("tidal-streamable", duration="PT34S"),
        ]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())

    assert result.status is ResolveStatus.MATCHED
    assert result.tidal_id == "tidal-streamable"
    assert result.duration_ms == 34_000


def test_duplicate_equivalent_editions_use_stable_tidal_id_tiebreak() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "auth.test":
            return token_response()
        return httpx.Response(200, json=search_document([track("tidal-b"), track("tidal-a")]))

    client = TidalCatalogClient("client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), token_url="https://auth.test/token", api_base_url="https://api.test/v2")
    result = client.resolve(candidate())

    assert result.status is ResolveStatus.MATCHED
    assert result.tidal_id == "tidal-a"


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
