import asyncio

from httpx import ASGITransport, AsyncClient, Response
import pytest
from pydantic import ValidationError

from audio_analysis.contracts import (
    DspFeatures,
    EmbeddingResult,
    MfccFeatures,
    PredictionResult,
    RhythmFeatures,
    SpectralFeatures,
    Statistics,
    TonalFeatures,
)
from audio_analysis.main import create_app
from audio_analysis.models import AnalysisResult
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


class FakeAnalyzer:
    def __init__(self, ready: bool = True) -> None:
        self.ready = ready

    def load(self) -> None:
        self.ready = True

    def available(self) -> bool:
        return self.ready

    def analyze(self, _decoded: DecodedAudio) -> AnalysisResult:
        statistics = Statistics(
            mean=0.0,
            standardDeviation=0.0,
            minimum=0.0,
            maximum=0.0,
        )
        dsp = DspFeatures(
            rhythm=RhythmFeatures(bpm=None, confidence=None, beatCount=0),
            tonal=TonalFeatures(key=None, mode=None, strength=None),
            spectral=SpectralFeatures(
                centroidHz=statistics,
                rolloffHz=statistics,
                flatnessDb=statistics,
            ),
            mfcc=MfccFeatures(
                coefficientMeans=[0.0] * 13,
                coefficientStandardDeviations=[0.0] * 13,
            ),
            errors=["rhythm_insufficient_signal", "tonal_insufficient_signal"],
        )
        return AnalysisResult(
            dsp=dsp,
            embedding=EmbeddingResult(
                modelId="test/maest",
                modelRevision="1",
                dimensions=2304,
                normalization="l2",
                values=[1.0] + [0.0] * 2303,
            ),
            predictions=[
                PredictionResult(
                    modelId="test/head",
                    modelRevision="1",
                    vocabularyVersion="1",
                    label="danceable",
                    probability=0.75,
                )
            ],
        )


def create_test_app(decoder: FakeDecoder | None = None):
    return create_app(decoder or FakeDecoder(), FakeAnalyzer())


def request(app, method: str, path: str, **kwargs) -> Response:
    async def send() -> Response:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


def test_health_reports_model_readiness():
    app = create_test_app()

    assert request(app, "GET", "/health/live").json() == {"status": "live"}
    assert request(app, "GET", "/health/ready").json() == {
        "status": "ready",
        "stage": "complete",
        "featureVersion": "essentia-dsp-v1",
    }


def test_analysis_contract_preserves_hash_and_marks_models_unavailable():
    payload = wav_bytes(1)
    response = request(
        create_test_app(),
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
    app = create_app(
        FakeDecoder(),
        FakeAnalyzer(),
        max_request_bytes=len(payload) - 1,
    )

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
        create_test_app(),
        "POST",
        "/v1/audio-analysis",
        headers=bad_media_headers,
        content=payload,
    ).status_code == 415

    bad_hash_headers = preview_headers(payload) | {"X-Preview-Sha256": "0" * 64}
    mismatch = request(
        create_test_app(),
        "POST",
        "/v1/audio-analysis",
        headers=bad_hash_headers,
        content=payload,
    )
    assert mismatch.status_code == 400
    assert mismatch.json()["detail"] == "preview_hash_mismatch"

    wrong_version = request(
        create_test_app(),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload, "unknown-v1"),
        content=payload,
    )
    assert wrong_version.status_code == 409
    assert wrong_version.json()["detail"] == "feature_version_unsupported"


def test_decode_failures_have_stable_error_codes():
    payload = wav_bytes(1)
    response = request(
        create_test_app(FakeDecoder("preview_decode_timeout")),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload),
        content=payload,
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "preview_decode_timeout"}


def test_complete_analysis_contract_contains_valid_model_results():
    payload = wav_bytes(1)
    response = request(
        create_test_app(),
        "POST",
        "/v1/audio-analysis",
        headers=preview_headers(payload, "essentia-dsp-v1"),
        content=payload,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["analysisStage"] == "complete"
    assert body["features"]["dsp"]["errors"] == [
        "rhythm_insufficient_signal",
        "tonal_insufficient_signal",
    ]
    assert body["embedding"]["dimensions"] == 2304
    assert len(body["embedding"]["values"]) == 2304
    assert body["predictions"][0]["probability"] == 0.75


def test_embedding_contract_rejects_bad_dimension_and_norm():
    with pytest.raises(ValidationError, match="embedding_dimensions_mismatch"):
        EmbeddingResult(
            modelId="test",
            modelRevision="1",
            dimensions=2,
            normalization="l2",
            values=[1.0],
        )

    with pytest.raises(ValidationError, match="embedding_norm_invalid"):
        EmbeddingResult(
            modelId="test",
            modelRevision="1",
            dimensions=2,
            normalization="l2",
            values=[0.5, 0.5],
        )
