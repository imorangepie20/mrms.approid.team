from __future__ import annotations

import json

import httpx
import pytest

from ems_pipeline.spotify_charts import (
    SPOTIFY_CHART_TARGETS,
    SpotifyChartTarget,
    fetch_spotify_chart_playlists,
    parse_spotify_embed,
)


def embed_html(target: SpotifyChartTarget, *, count: int = 50) -> str:
    tracks = [
        {
            "uri": f"spotify:track:{index:022d}",
            "title": f"Track {index}",
            "subtitle": "Artist\u00a0Name",
            "duration": 180_000,
        }
        for index in range(count)
    ]
    payload = {
        "props": {"pageProps": {"state": {"data": {"entity": {
            "id": target.spotify_id,
            "coverArt": {"sources": [{"url": "https://charts-images.scdn.co/chart.jpg"}]},
            "trackList": tracks,
        }}}}},
    }
    return f'<script id="__NEXT_DATA__" type="application/json">{json.dumps(payload)}</script>'


def test_parse_spotify_embed_extracts_exactly_fifty_tracks() -> None:
    playlist = parse_spotify_embed(embed_html(SPOTIFY_CHART_TARGETS[0]), SPOTIFY_CHART_TARGETS[0])
    assert len(playlist.tracks) == 50
    assert playlist.tracks[0].artist == "Artist Name"
    assert playlist.tracks[0].resolver_artist == "Artist Name"
    assert playlist.artwork_url == "https://charts-images.scdn.co/chart.jpg"


@pytest.mark.parametrize("count", [0, 49, 51])
def test_parse_spotify_embed_rejects_partial_or_oversized_playlists(count: int) -> None:
    with pytest.raises(ValueError, match="spotify_playlist_track_count_invalid"):
        parse_spotify_embed(embed_html(SPOTIFY_CHART_TARGETS[0], count=count), SPOTIFY_CHART_TARGETS[0])


def test_fetch_spotify_charts_uses_four_bounded_public_requests() -> None:
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        target = next(item for item in SPOTIFY_CHART_TARGETS if item.spotify_id in str(request.url))
        return httpx.Response(200, text=embed_html(target), request=request)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        playlists = fetch_spotify_chart_playlists(client, lambda: calls.append("request"))
    assert len(playlists) == 4
    assert len(calls) == 4


def test_parse_spotify_embed_rejects_untrusted_artwork_origin() -> None:
    html = embed_html(SPOTIFY_CHART_TARGETS[0]).replace(
        "https://charts-images.scdn.co/chart.jpg", "https://example.com/chart.jpg"
    )
    assert parse_spotify_embed(html, SPOTIFY_CHART_TARGETS[0]).artwork_url is None


def test_parse_spotify_embed_keeps_all_artists_but_resolves_by_primary_artist() -> None:
    html = embed_html(SPOTIFY_CHART_TARGETS[0]).replace(
        '"subtitle": "Artist\\u00a0Name"',
        '"subtitle": "Primary Artist, Guest Artist"',
    )
    track = parse_spotify_embed(html, SPOTIFY_CHART_TARGETS[0]).tracks[0]
    assert track.artist == "Primary Artist, Guest Artist"
    assert track.resolver_artist == "Primary Artist"
