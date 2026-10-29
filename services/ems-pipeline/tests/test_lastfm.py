from __future__ import annotations

import httpx
import pytest

from ems_pipeline.lastfm import LastfmClient, LastfmKeyInvalidError, LastfmResult, run_lastfm_batch

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

    for handler in (boom, lambda r: httpx.Response(429), lambda r: httpx.Response(200, json={"error": 8, "message": KEY})):
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


@pytest.mark.parametrize("code", [10, 26])
def test_invalid_or_suspended_key_aborts_without_leaking_key(code):
    client, seen = make(lambda r: httpx.Response(200, json={"error": code, "message": f"bad {KEY}"}))
    with pytest.raises(LastfmKeyInvalidError) as excinfo:
        client.top_tags("a")
    assert len(seen) == 1
    assert KEY not in str(excinfo.value) and "lastfm_key_invalid" in str(excinfo.value)


@pytest.mark.parametrize("code", [11, 16, 29])
def test_temporary_lastfm_errors_are_retried(code):
    responses = iter([httpx.Response(200, json={"error": code}), httpx.Response(200, json={"toptags": {"tag": []}})])
    client, seen = make(lambda r: next(responses))
    assert client.top_tags("a").status == "ok" and len(seen) == 2


def test_honors_retry_after_on_429_capped():
    clock = Clock()
    responses = iter([
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(429, headers={"Retry-After": "900"}),
        httpx.Response(200, json={"toptags": {"tag": []}}),
    ])
    client, seen = make(lambda r: next(responses), clock)
    assert client.top_tags("a").status == "ok" and len(seen) == 3
    assert 7 in clock.sleeps and 120 in clock.sleeps and 900 not in clock.sleeps


class FakeClient:
    def __init__(self, results, clock: Clock | None = None, step: float = 0.0) -> None:
        self.results = iter(results)
        self.clock = clock
        self.step = step
        self.calls: list[str] = []

    def top_tags(self, name: str) -> LastfmResult:
        self.calls.append(name)
        if self.clock is not None:
            self.clock.now += self.step
        result = next(self.results)
        if isinstance(result, Exception):
            raise result
        return result


def artists(n: int) -> list[dict[str, str]]:
    return [{"artist_key": f"k{i}", "display_name": f"Artist {i}"} for i in range(n)]


def test_batch_finishes_without_stop_reason():
    recorded: list[str] = []
    client = FakeClient([LastfmResult("ok", [("rock", 1)]), LastfmResult("not_found"), LastfmResult("failed", [], "http_500")])
    counts = run_lastfm_batch(client, artists(3), lambda a, r: recorded.append(a["artist_key"]), clock=Clock())
    assert counts == {"requested": 3, "ok": 1, "not_found": 1, "failed": 1, "stopped_reason": None}
    assert recorded == ["k0", "k1", "k2"]


def test_batch_stops_after_ten_consecutive_failures():
    failed = LastfmResult("failed", [], "http_503")
    results = [failed] * 9 + [LastfmResult("ok")] + [failed] * 10 + [LastfmResult("ok")] * 5
    client = FakeClient(results)
    counts = run_lastfm_batch(client, artists(25), lambda a, r: None, clock=Clock())
    assert counts["stopped_reason"] == "consecutive_failures"
    assert counts["requested"] == 20 and counts["failed"] == 19 and counts["ok"] == 1


def test_batch_stops_at_time_budget():
    clock = Clock()
    client = FakeClient([LastfmResult("ok")] * 100, clock, step=300.0)
    counts = run_lastfm_batch(client, artists(100), lambda a, r: None, clock=clock)
    assert counts["stopped_reason"] == "time_budget"
    assert counts["requested"] == 4  # 4 x 300 s reaches the 20-minute budget


def test_batch_aborts_on_invalid_key_without_recording_that_artist():
    recorded: list[str] = []
    client = FakeClient([LastfmResult("ok"), LastfmKeyInvalidError(10), LastfmResult("ok")])
    counts = run_lastfm_batch(client, artists(3), lambda a, r: recorded.append(a["artist_key"]), clock=Clock())
    assert counts["stopped_reason"] == "key_invalid"
    assert counts["requested"] == 1 and recorded == ["k0"] and len(client.calls) == 2
