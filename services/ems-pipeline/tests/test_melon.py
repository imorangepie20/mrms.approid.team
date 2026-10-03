from __future__ import annotations

import httpx
import pytest

from ems_pipeline import melon


GENRES = [{"code": f"GN0{i}00", "name": f"Genre {i}"} for i in range(1, 9)]


def songs(start: int, count: int = 5) -> list[melon.MelonSong]:
    return [melon.MelonSong(str(i), f"Song {i}", "Artist", "Album")
            for i in range(start, start + count)]


def job(index: int = 0, start: int = 1) -> dict:
    return {"genre_codes": GENRES, "genre_index": index, "next_start_index": start,
            "last_page_first_song_id": None, "genre_checkpoints": {}}


@pytest.mark.parametrize("start", [1, 6, 51])
def test_five_song_page_uses_paging_endpoint_even_on_first_page(start: int) -> None:
    requests = []
    with httpx.Client(transport=httpx.MockTransport(
        lambda request: (requests.append(request) or httpx.Response(200, text="songList"))
    )) as http:
        client = melon.MelonClient(http, should_continue=lambda: True, on_request=lambda: None)
        client.get_page("GN0200", start, page_size=5)
    assert len(requests) == 1
    assert requests[0].url.path == "/genre/song_listPaging.htm"
    assert requests[0].url.params["pageSize"] == "5"
    assert requests[0].url.params["startIndex"] == str(start)
    assert requests[0].url.params["gnrCode"] == "GN0200"


def test_url_import_default_page_remains_fifty() -> None:
    requests = []
    with httpx.Client(transport=httpx.MockTransport(
        lambda request: (requests.append(request) or httpx.Response(200, text="songList"))
    )) as http:
        client = melon.MelonClient(http, should_continue=lambda: True, on_request=lambda: None)
        client.get_page("GN0100", 1)
        client.wait = lambda _: None
        client.get_page("GN0100", 51)
    assert requests[0].url.path == "/genre/song_list.htm"
    assert requests[1].url.params["pageSize"] == "50"


def test_two_rounds_visit_all_eight_genres_without_page_gaps() -> None:
    state = job()
    visited = []
    for step in range(16):
        visited.append((state["genre_index"], state["next_start_index"]))
        state.update(melon._next_genre_state(state, songs(step * 5 + 100)))
    assert visited == [(i, start) for start in (1, 6) for i in range(8)]
    assert state["genre_index"] == 0
    assert state["next_start_index"] == 11
    assert all(c["nextStartIndex"] == 11 for c in state["genre_checkpoints"].values())


def test_legacy_cursor_and_completed_genres_survive_rotation() -> None:
    state = job(index=3, start=151)
    state["last_page_first_song_id"] = "50"
    state.update(melon._next_genre_state(state, songs(200)))
    assert state["genre_index"] == 4
    assert state["next_start_index"] == 1
    assert state["genre_checkpoints"]["GN0400"]["nextStartIndex"] == 156
    assert all(state["genre_checkpoints"][g["code"]]["completed"] for g in GENRES[:3])
    for step in range(4):
        state.update(melon._next_genre_state(state, songs(300 + step * 5)))
    assert state["genre_index"] == 3
    assert state["next_start_index"] == 156
    assert state["last_page_first_song_id"] == "200"


@pytest.mark.parametrize("count", [0, 2, 4])
def test_short_last_page_completes_only_its_genre_and_is_skipped(count: int) -> None:
    state = job(start=6)
    state.update(melon._next_genre_state(state, songs(100, count)))
    assert state["genre_checkpoints"]["GN0100"]["completed"] is True
    for step in range(7):
        state.update(melon._next_genre_state(state, songs(200 + step * 5)))
    assert state["genre_index"] == 1
    assert state["next_start_index"] == 6


def test_all_completed_genres_finish_job() -> None:
    state = job(index=7, start=6)
    state.update(melon._next_genre_state(state, []))
    assert state["genre_index"] == 8
    assert state["next_start_index"] == 1
    assert state["last_page_first_song_id"] is None


def test_repeated_page_is_checked_against_same_genre_after_rotation() -> None:
    state = job()
    for step in range(8):
        state.update(melon._next_genre_state(state, songs(100 + step * 5)))
    with pytest.raises(ValueError, match="melon_pagination_repeated"):
        melon._next_genre_state(state, songs(100))


def test_more_than_five_tracks_cannot_advance_or_be_staged() -> None:
    with pytest.raises(ValueError, match="melon_page_size_changed"):
        melon._next_genre_state(job(), songs(100, 6))


def test_batch_closes_for_partial_page_and_legacy_hundred() -> None:
    assert melon.BATCH_SIZE == 5
    for count in (1, 2, 4, 5, 50, 100):
        assert melon._batch_closed(count)
    assert not melon._batch_closed(0)


def test_rate_limit_keeps_bounded_retries_and_retry_after() -> None:
    attempts, waits = [], []
    with httpx.Client(transport=httpx.MockTransport(
        lambda request: (attempts.append(request) or httpx.Response(429, headers={"Retry-After": "75"}))
    )) as http:
        client = melon.MelonClient(http, should_continue=lambda: True, on_request=lambda: None)
        client.wait = waits.append
        with pytest.raises(ValueError, match="melon_rate_limited"):
            client.get_page("GN0200", 1, page_size=5)
    assert len(attempts) == 3
    assert waits.count(75) == 2
