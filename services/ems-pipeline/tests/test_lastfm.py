from __future__ import annotations

import httpx

from ems_pipeline.lastfm import LastfmClient

KEY = "secret-key-123"


class Clock:
    def __init__(self) -> None:
        self.now = 100.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def make(handler, clock: Clock | None = None) -> tuple[LastfmClient, list[httpx.Request]]:
    clock = clock or Clock()
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    client = LastfmClient(KEY, httpx.Client(transport=httpx.MockTransport(wrapped)), clock=clock, sleep=clock.sleep)
    return client, seen


def test_top_tags_returns_first_ten():
    tags = [{"name": f"tag{i}", "count": str(100 - i), "url": "x"} for i in range(15)]
    client, seen = make(lambda r: httpx.Response(200, json={"toptags": {"tag": tags}}))
    result = client.top_tags("Some Artist")
    assert result.status == "ok"
    assert len(result.tags) == 10
    assert result.tags[0] == ("tag0", 100)
    params = seen[0].url.params
    assert params["method"] == "artist.gettoptags" and params["artist"] == "Some Artist"
    assert params["autocorrect"] == "1" and params["format"] == "json" and params["api_key"] == KEY


def test_single_tag_dict_and_filtering():
    payload = {"toptags": {"tag": {"name": "jazz", "count": 5}}}
    client, _ = make(lambda r: httpx.Response(200, json=payload))
    assert client.top_tags("a").tags == [("jazz", 5)]
    payload2 = {"toptags": {"tag": [{"name": "", "count": 9}, {"name": "x", "count": 0}, {"name": "ok", "count": "3"}]}}
    client, _ = make(lambda r: httpx.Response(200, json=payload2))
    assert client.top_tags("a").tags == [("ok", 3)]


def test_error_6_is_not_found():
    client, seen = make(lambda r: httpx.Response(200, json={"error": 6, "message": "not found"}))
    result = client.top_tags("nobody")
    assert result.status == "not_found" and result.tags == [] and len(seen) == 1


def test_retries_rate_limit_then_fails():
    client, seen = make(lambda r: httpx.Response(200, json={"error": 29, "message": "limit"}))
    result = client.top_tags("a")
    assert result.status == "failed" and len(seen) == 5


def test_retries_5xx_then_succeeds():
    responses = iter([httpx.Response(503), httpx.Response(200, json={"toptags": {"tag": [{"name": "rock", "count": 1}]}})])
    client, seen = make(lambda r: next(responses))
    assert client.top_tags("a").status == "ok" and len(seen) == 2


def test_api_key_never_in_error_code():
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(f"failed {request.url}", request=request)

    for handler in (boom, lambda r: httpx.Response(429), lambda r: httpx.Response(200, json={"error": 10, "message": KEY})):
        client, _ = make(handler)
        result = client.top_tags("a")
        assert result.status == "failed" and result.error_code
        assert KEY not in result.error_code


def test_waits_min_interval():
    clock = Clock()
    client, _ = make(lambda r: httpx.Response(200, json={"toptags": {"tag": []}}), clock)
    client.top_tags("a")
    start = clock.now
    client.top_tags("b")
    assert clock.now - start >= 1.0
