import pytest
import httpx

from ems_pipeline.tidal import TidalCatalogClient
from ems_pipeline.tidal_popularity import (
    EditorialPlaylist,
    EditorialTrack,
    EditorialRequestBudgetExceeded,
    fetch_editorial_playlists,
    fetch_playlist_tracks,
    rank_editorial_playlists,
    resolve_next_page_url,
    select_editorial_candidates,
)


def editorial_track(
    tidal_id: str,
    *,
    isrc: str,
    artist: str = "Artist",
    album: str = "Album",
    popularity: float = 0.8,
    playlist_followers: int = 10_000,
) -> EditorialTrack:
    return EditorialTrack(
        tidal_id=tidal_id,
        isrc=isrc,
        title=f"Track {tidal_id}",
        artist=artist,
        album=album,
        duration_ms=180_000,
        popularity=popularity,
        playlist_followers=playlist_followers,
    )


def test_rank_editorial_playlists_keeps_only_public_editorial_music_lists() -> None:
    document = {
        "included": [
            {"type": "playlists", "id": "low", "attributes": {"playlistType": "EDITORIAL", "accessType": "PUBLIC", "numberOfTrackItems": 20, "numberOfFollowers": 50}},
            {"type": "playlists", "id": "high", "attributes": {"playlistType": "EDITORIAL", "accessType": "PUBLIC", "numberOfTrackItems": 100, "numberOfFollowers": 500, "lastUpdatedAt": "2026-09-22T00:00:00Z"}},
            {"type": "playlists", "id": "user", "attributes": {"playlistType": "USER", "accessType": "PUBLIC", "numberOfTrackItems": 100, "numberOfFollowers": 5_000}},
            {"type": "playlists", "id": "short", "attributes": {"playlistType": "EDITORIAL", "accessType": "PUBLIC", "numberOfTrackItems": 2, "numberOfFollowers": 50_000}},
        ]
    }

    playlists = rank_editorial_playlists([document])
    assert [item.playlist_id for item in playlists] == ["high", "low"]
    assert playlists[0].updated_at == "2026-09-22T00:00:00Z"


def test_select_editorial_candidates_deduplicates_isrc_and_prioritizes_popularity() -> None:
    tracks = [
        editorial_track("edition-low", isrc="ISRC-A", popularity=0.2),
        editorial_track("edition-high", isrc="isrc-a", popularity=0.9),
        editorial_track("second", isrc="ISRC-B", artist="Other", popularity=0.8),
    ]

    selected = select_editorial_candidates(tracks, limit=2)

    assert [item.isrc for item in selected] == ["ISRC-A", "ISRC-B"]
    assert selected[0].candidate_key == "tidal:edition-high:ISRC-A"
    assert selected[0].recording_mbid is None
    assert selected[0].selection_bucket == "canonical"
    assert selected[0].selection_score > selected[1].selection_score


def test_select_editorial_candidates_caps_each_artist_and_album_at_five() -> None:
    tracks = [editorial_track(str(index), isrc=f"ISRC-{index}", popularity=1 - index / 100) for index in range(8)]
    tracks += [editorial_track(f"other-{index}", isrc=f"OTHER-{index}", artist=f"Other {index}", album=f"Other {index}", popularity=0.5) for index in range(3)]

    selected = select_editorial_candidates(tracks, limit=8)

    assert len(selected) == 8
    assert sum(item.artist == "Artist" for item in selected) == 5


def test_next_page_url_rejects_external_origin_and_repeated_cursor() -> None:
    base = "https://openapi.tidal.com/v2"
    visited: set[str] = set()

    page = resolve_next_page_url(base, "/playlists/p/relationships/items?page[cursor]=one", visited, page_count=1)
    assert page == "https://openapi.tidal.com/v2/playlists/p/relationships/items?page[cursor]=one"
    with pytest.raises(ValueError, match="repeated"):
        resolve_next_page_url(base, page, visited, page_count=2)
    with pytest.raises(ValueError, match="origin"):
        resolve_next_page_url(base, "https://example.test/steal", set(), page_count=1)
    with pytest.raises(ValueError, match="page limit"):
        resolve_next_page_url(base, "/playlists/p/relationships/items?page[cursor]=two", set(), page_count=100)


def test_editorial_fetch_does_not_issue_http_after_budget_is_exhausted() -> None:
    calls = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"included": []})

    client = TidalCatalogClient(
        "client",
        "secret",
        request_budget=0,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
        api_base_url="https://api.test/v2",
    )

    with pytest.raises(EditorialRequestBudgetExceeded):
        fetch_editorial_playlists(client, "token", ("Jazz",))
    assert calls == 0


def test_editorial_playlist_fetch_honors_page_cap(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = 0

    def fake_document(*_args: object, **_kwargs: object) -> dict[str, object]:
        nonlocal calls
        calls += 1
        return {"data": [], "included": [], "links": {"next": "/next"}}

    monkeypatch.setattr("ems_pipeline.tidal_popularity._get_document", fake_document)
    client = TidalCatalogClient("client", "secret", api_base_url="https://api.test/v2")

    fetch_playlist_tracks(
        client,
        "token",
        EditorialPlaylist("playlist", "Jazz", 10),
        max_pages=1,
    )

    assert calls == 1
