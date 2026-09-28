import asyncio

from httpx import ASGITransport, AsyncClient, Response

from audio_analysis.main import create_app
from audio_analysis.preprocess import AudioPreprocessError, DecodedAudio
from helpers import preview_headers, wav_bytes


class FakeDecoder:
    def __init__(self, error: str | None = None) -> None:
        self.error = error

    def available(self) -> bool:
        return True

    def decode(self, _payload: bytes) -> DecodedAudio:
        if self.error:
            raise AudioPreprocessError(self.error)
        return DecodedAudio(tuple([0.0] * 16_000))


def request(app, method: str, path: str, **kwargs) -> Response:
    async def send() -> Response:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_health_reports_preprocess_readiness():
    app = create_app(FakeDecoder())

    assert request(app, "GET", "/health/live").json() == {"status": "live"}
    assert request(app, "GET", "/health/ready").json() == {
        "status": "ready",
        "stage": "preprocess",
    }


def test_analysis_contract_preserves_hash_and_marks_models_unavailable():
    payload = wav_bytes(1)
    response = request(
        create_app(FakeDecoder()),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload),
        content=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["previewHash"] == preview_headers(payload)["X-Preview-Sha256"]
    assert body["featureVersion"] == "audio-preprocess-v1"
    assert body["analysisStage"] == "preprocess"
    assert body["durationSeconds"] == 1.0
    assert body["features"]["summary"] == {"segmentCount": 1, "coverageRatio": 0.03333333}
    assert body["embedding"] is None
    assert body["predictions"] == []


def test_request_boundaries_reject_bad_media_hash_version_and_size():
    payload = wav_bytes(1)
    app = create_app(FakeDecoder(), max_request_bytes=len(payload) - 1)

    too_large = request(
        app,
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload),
        content=payload,
    )
    assert too_large.status_code == 413
    assert too_large.json()["detail"] == "preview_too_large"

    bad_media_headers = preview_headers(payload) | {"Content-Type": "text/plain"}
    assert request(
        create_app(FakeDecoder()),
        "POST",
        "/v1/audio-analysis",
        headers=bad_media_headers,
        content=payload,
    ).status_code == 415

    bad_hash_headers = preview_headers(payload) | {"X-Preview-Sha256": "0" * 64}
    mismatch = request(
        create_app(FakeDecoder()),
        "POST",
        "/v1/audio-analysis",
        headers=bad_hash_headers,
        content=payload,
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"] == "preview_hash_mismatch"

    wrong_version = request(
        create_app(FakeDecoder()),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload, "essentia-dsp-v1"),
        content=payload,
    )
    assert wrong_version.status_code == 409
    assert wrong_version.json()["detail"] == "feature_version_unsupported"


def test_decode_failures_have_stable_error_codes():
    payload = wav_bytes(1)
    response = request(
        create_app(FakeDecoder("preview_decode_timeout")),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload),
        content=payload,
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "preview_decode_timeout"}
