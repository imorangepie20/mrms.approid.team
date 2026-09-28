from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import asyncio
from hashlib import sha256
import logging
import os
import re

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .contracts import AudioAnalysisResponse
from .models import (
    AudioAnalyzer,
    AudioModelError,
    EssentiaOnnxAnalyzer,
    MODEL_FEATURE_VERSION,
)
from .preprocess import AudioPreprocessError, FfmpegDecoder, build_features


PREPROCESS_FEATURE_VERSION = "audio-preprocess-v1"
SUPPORTED_FEATURE_VERSIONS = {PREPROCESS_FEATURE_VERSION, MODEL_FEATURE_VERSION}
DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024
DEFAULT_DECODE_TIMEOUT_SECONDS = 20.0
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
LOGGER = logging.getLogger(__name__)


def _positive_int(name: str, default: int) -> int:
    value = int(os.getenv(name, str(default)))
    if value <= 0:
        raise RuntimeError(f"{name} must be positive")
    return value


def _positive_float(name: str, default: float) -> float:
    value = float(os.getenv(name, str(default)))
    if value <= 0:
        raise RuntimeError(f"{name} must be positive")
    return value


async def _read_bounded_body(request: Request, max_bytes: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > max_bytes:
                raise HTTPException(status_code=413, detail="preview_too_large")
        except ValueError as error:
            raise HTTPException(status_code=400, detail="content_length_invalid") from error

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > max_bytes:
            raise HTTPException(status_code=413, detail="preview_too_large")
    if not body:
        raise HTTPException(status_code=400, detail="preview_empty")
    return bytes(body)


def _normalize_hash(value: str) -> str:
    normalized = value.strip().lower()
    if normalized.startswith("sha256:"):
        normalized = normalized.removeprefix("sha256:")
    if not SHA256_PATTERN.fullmatch(normalized):
        raise HTTPException(status_code=400, detail="preview_hash_invalid")
    return normalized


def create_app(
    decoder: FfmpegDecoder | None = None,
    analyzer: AudioAnalyzer | None = None,
    *,
    max_request_bytes: int | None = None,
    concurrency: int | None = None,
) -> FastAPI:
    active_decoder = decoder or FfmpegDecoder(
        timeout_seconds=_positive_float(
            "AUDIO_ANALYSIS_DECODE_TIMEOUT_SECONDS",
            DEFAULT_DECODE_TIMEOUT_SECONDS,
        )
    )
    active_analyzer = analyzer or EssentiaOnnxAnalyzer.from_environment()
    request_limit = max_request_bytes or _positive_int(
        "AUDIO_ANALYSIS_MAX_REQUEST_BYTES",
        DEFAULT_MAX_REQUEST_BYTES,
    )
    active_concurrency = concurrency or _positive_int("AUDIO_ANALYSIS_CONCURRENCY", 1)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            await asyncio.to_thread(active_analyzer.load)
        except AudioModelError:
            LOGGER.exception("audio analysis model startup failed")
        app.state.ready = active_decoder.available() and active_analyzer.available()
        yield

    app = FastAPI(lifespan=lifespan)
    app.state.decoder = active_decoder
    app.state.analyzer = active_analyzer
    app.state.ready = active_decoder.available() and active_analyzer.available()
    app.state.analysis_slots = asyncio.Semaphore(active_concurrency)

    @app.exception_handler(AudioPreprocessError)
    async def preprocess_error_handler(
        _request: Request,
        error: AudioPreprocessError,
    ) -> JSONResponse:
        status = 422
        if error.code == "preview_too_long":
            status = 413
        elif error.code in {"ffmpeg_unavailable", "preview_decode_timeout"}:
            status = 503
        return JSONResponse(status_code=status, content={"detail": error.code})

    @app.exception_handler(AudioModelError)
    async def model_error_handler(
        _request: Request,
        error: AudioModelError,
    ) -> JSONResponse:
        status = 503 if error.code == "models_not_ready" else 502
        return JSONResponse(status_code=status, content={"detail": error.code})

    @app.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready")
    def ready() -> dict[str, str]:
        if not app.state.ready:
            raise HTTPException(status_code=503, detail="models_not_ready")
        return {
            "status": "ready",
            "stage": "complete",
            "featureVersion": MODEL_FEATURE_VERSION,
        }

    @app.post(
        "/v1/audio-analysis",
        response_model=AudioAnalysisResponse,
        response_model_by_alias=True,
    )
    async def analyze(
        request: Request,
        x_preview_sha256: str = Header(alias="X-Preview-Sha256"),
        x_feature_version: str = Header(alias="X-Feature-Version"),
    ) -> AudioAnalysisResponse:
        content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
        if not (content_type.startswith("audio/") or content_type == "application/octet-stream"):
            raise HTTPException(status_code=415, detail="content_type_unsupported")
        if x_feature_version not in SUPPORTED_FEATURE_VERSIONS:
            raise HTTPException(status_code=409, detail="feature_version_unsupported")
        if (
            x_feature_version == MODEL_FEATURE_VERSION
            and not app.state.analyzer.available()
        ):
            raise HTTPException(status_code=503, detail="models_not_ready")

        payload = await _read_bounded_body(request, request_limit)
        expected_hash = _normalize_hash(x_preview_sha256)
        actual_hash = sha256(payload).hexdigest()
        if expected_hash != actual_hash:
            raise HTTPException(status_code=400, detail="preview_hash_mismatch")

        async with app.state.analysis_slots:
            decoded = await asyncio.to_thread(app.state.decoder.decode, payload)
            features = await asyncio.to_thread(build_features, decoded)

            embedding = None
            predictions = []
            analysis_stage = "preprocess"
            if x_feature_version == MODEL_FEATURE_VERSION:
                result = await asyncio.to_thread(app.state.analyzer.analyze, decoded)
                features = features.model_copy(update={"dsp": result.dsp})
                embedding = result.embedding
                predictions = result.predictions
                analysis_stage = "complete"

        return AudioAnalysisResponse(
            previewHash=actual_hash,
            durationSeconds=round(decoded.duration_seconds, 8),
            sampleRate=decoded.sample_rate,
            channelCount=1,
            featureVersion=x_feature_version,
            analysisStage=analysis_stage,
            features=features,
            embedding=embedding,
            predictions=predictions,
        )

    return app


app = create_app()
