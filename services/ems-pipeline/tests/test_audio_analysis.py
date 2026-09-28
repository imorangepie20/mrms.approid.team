from contextlib import nullcontext
import base64
import json

import httpx
import pytest

from ems_pipeline import audio_analysis
from ems_pipeline.audio_analysis import (
    AudioAnalysisClient,
    AudioJob,
    AudioJobError,
    PreviewPayload,
    TidalPreviewClient,
    claim_audio_jobs,
    run_audio_worker,
    stage_audio_jobs,
    validate_analysis,
)


def valid_analysis(preview_hash: str = "a" * 64):
    return {
        "previewHash": preview_hash,
        "durationSeconds": 30.0,
        "sampleRate": 16000,
        "channelCount": 1,
        "featureVersion": "essentia-dsp-v1",
        "analysisStage": "complete",
        "features": {
            "whole": {"rmsEnergy": 0.1},
            "segments": [{"index": 0}],
            "summary": {"segmentCount": 1, "coverageRatio": 1.0},
            "dsp": {"rhythm": {}, "tonal": {}, "spectral": {}, "mfcc": {}, "errors": []},
        },
        "embedding": {
            "modelId": "essentia/maest-30s",
            "modelRevision": "revision",
            "dimensions": 2304,
            "normalization": "l2",
            "values": [1.0] + [0.0] * 2303,
        },
        "predictions": [{
            "modelId": "essentia/maest-30s",
            "modelRevision": "revision",
            "vocabularyVersion": "v1",
            "label": "rock",
            "probability": 0.8,
        }],
    }


def test_tidal_preview_uses_preview_contract_and_never_returns_stream_url():
    audio = b"preview-bytes"
    manifest = base64.b64encode(json.dumps({
        "assetPresentation": "PREVIEW",
        "encryptionType": "NONE",
        "mimeType": "audio/mp4",
        "urls": ["https://stream.example/preview.m4a?sig=secret"],
    }).encode()).decode()
    requests = []

    def handler(request: httpx.Request):
        requests.append(request)
        if request.url.host == "auth.tidal.com":
            return httpx.Response(200, json={"access_token": "token"})
        if request.url.host == "api.tidal.com":
            return httpx.Response(200, json={"assetPresentation": "PREVIEW", "manifest": manifest})
        return httpx.Response(200, content=audio, headers={"content-type": "audio/mp4"})

    client = TidalPreviewClient(
        "client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)), request_budget=3
    )
    result = client.download("123")

    assert result.content == audio
    assert result.content_type == "audio/mp4"
    assert len(result.preview_hash) == 64
    query = requests[1].url.params
    assert query["assetpresentation"] == "PREVIEW"
    assert query["audioquality"] == "LOW"
    assert not hasattr(result, "stream_url")


def test_tidal_preview_rejects_oversized_content_before_reading_body():
    manifest = base64.b64encode(json.dumps({
        "assetPresentation": "PREVIEW", "encryptionType": "NONE", "url": "https://stream.example/a"
    }).encode()).decode()

    def handler(request: httpx.Request):
        if request.url.host == "auth.tidal.com":
            return httpx.Response(200, json={"access_token": "token"})
        if request.url.host == "api.tidal.com":
            return httpx.Response(200, json={"assetPresentation": "PREVIEW", "manifest": manifest})
        return httpx.Response(200, content=b"12345", headers={"content-type": "audio/mp4", "content-length": "5"})

    client = TidalPreviewClient(
        "client", "secret", http_client=httpx.Client(transport=httpx.MockTransport(handler)),
        request_budget=3, max_preview_bytes=4,
    )
    with pytest.raises(AudioJobError, match="preview_too_large") as caught:
        client.download("123")
    assert caught.value.retryable is False


def test_analysis_client_validates_hash_shape_and_l2_contract():
    preview = PreviewPayload(b"bytes", "audio/mp4", "a" * 64)
    client = AudioAnalysisClient(
        "http://audio-analysis:8000",
        http_client=httpx.Client(transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=valid_analysis()))),
    )
    assert client.analyze(preview)["embedding"]["dimensions"] == 2304

    invalid = valid_analysis()
    invalid["embedding"]["values"][0] = 2.0
    with pytest.raises(AudioJobError, match="analysis_embedding_invalid"):
        validate_analysis(invalid, "a" * 64)


class FakeResult:
    def __init__(self, rows=None, rowcount=0):
        self.rows = rows or []
        self.rowcount = rowcount

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, results):
        self.results = list(results)
        self.calls = []

    def execute(self, sql, values=None):
        self.calls.append((sql, values))
        return self.results.pop(0)

    def transaction(self):
        return nullcontext()


def test_stage_jobs_is_bounded_and_resets_only_changed_versions():
    connection = FakeConnection([FakeResult(rowcount=7)])
    assert stage_audio_jobs(connection, limit=10_000) == 7
    sql, values = connection.calls[0]
    assert "LIMIT %s" in sql
    assert "job.feature_version <> %s" in sql
    assert values == ("essentia-dsp-v1", 100, "essentia-dsp-v1")


def test_claim_uses_skip_locked_and_caps_batch_size():
    connection = FakeConnection([FakeResult([
        {"track_id": "track-a", "tidal_id": "123"},
        {"track_id": "track-b", "tidal_id": "456"},
    ])])
    jobs = claim_audio_jobs(connection, limit=99, lease_seconds=1)
    assert jobs == [AudioJob("track-a", "123"), AudioJob("track-b", "456")]
    sql, values = connection.calls[0]
    assert "FOR UPDATE SKIP LOCKED" in sql
    assert values == (8, 60)


def test_worker_releases_unprocessed_claims_when_request_budget_stops_run(monkeypatch):
    connection = FakeConnection([])
    jobs = [AudioJob("track-a", "1"), AudioJob("track-b", "2")]
    released = []

    monkeypatch.setattr(audio_analysis, "claim_audio_jobs", lambda *_args, **_kwargs: jobs)
    monkeypatch.setattr(
        audio_analysis,
        "mark_audio_error",
        lambda *_args, **_kwargs: "retryable",
    )
    monkeypatch.setattr(
        audio_analysis,
        "release_audio_claims",
        lambda _connection, track_ids: released.extend(track_ids) or len(track_ids),
    )

    class BudgetClient:
        def download(self, _tidal_id):
            raise AudioJobError("request_budget_exhausted", retryable=True, stop_run=True)

    result = run_audio_worker(connection, BudgetClient(), object(), batch_size=2, max_batches=1)
    assert result == {
        "claimed": 2, "analyzed": 0, "reused": 0, "retryable": 1, "failed": 0, "released": 1
    }
    assert released == ["track-b"]


def test_worker_reuses_hash_without_calling_analysis_service(monkeypatch):
    connection = FakeConnection([])
    monkeypatch.setattr(audio_analysis, "claim_audio_jobs", lambda *_args, **_kwargs: [AudioJob("track-a", "1")])
    monkeypatch.setattr(audio_analysis, "reuse_completed_analysis", lambda *_args, **_kwargs: True)

    class PreviewClient:
        def download(self, _tidal_id):
            return PreviewPayload(b"same", "audio/mp4", "a" * 64)

    class AnalysisClient:
        def analyze(self, _preview):
            raise AssertionError("analysis service must not be called for a reusable hash")

    result = run_audio_worker(connection, PreviewClient(), AnalysisClient(), max_batches=1)
    assert result["reused"] == 1
    assert result["analyzed"] == 0


def test_worker_releases_current_and_remaining_claims_on_keyboard_interrupt(monkeypatch):
    connection = FakeConnection([])
    jobs = [AudioJob("track-a", "1"), AudioJob("track-b", "2")]
    released = []
    monkeypatch.setattr(audio_analysis, "claim_audio_jobs", lambda *_args, **_kwargs: jobs)
    monkeypatch.setattr(
        audio_analysis,
        "release_audio_claims",
        lambda _connection, track_ids: released.extend(track_ids) or len(track_ids),
    )

    class InterruptingClient:
        def download(self, _tidal_id):
            raise KeyboardInterrupt

    with pytest.raises(KeyboardInterrupt):
        run_audio_worker(connection, InterruptingClient(), object(), batch_size=2, max_batches=1)
    assert released == ["track-a", "track-b"]
