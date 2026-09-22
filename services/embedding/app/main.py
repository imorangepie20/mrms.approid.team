from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import math

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

from .model import (
    DIMENSIONS,
    MODEL_ID,
    MODEL_REVISION,
    Embedder,
    SentenceTransformerEmbedder,
)


class EmbeddingRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=16)

    @field_validator("texts")
    @classmethod
    def reject_blank_texts(cls, texts: list[str]) -> list[str]:
        if any(not text.strip() for text in texts):
            raise ValueError("texts must not contain blank values")
        return texts


def _valid_vector(vector: list[float]) -> bool:
    if len(vector) != DIMENSIONS or any(not math.isfinite(value) for value in vector):
        return False
    norm = math.sqrt(sum(value * value for value in vector))
    return 0.999 <= norm <= 1.001


def create_app(embedder: Embedder | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if app.state.embedder is None:
            app.state.embedder = SentenceTransformerEmbedder()
        yield

    app = FastAPI(lifespan=lifespan)
    app.state.embedder = embedder

    @app.get("/health/live")
    def live() -> dict[str, str]:
        return {"status": "live"}

    @app.get("/health/ready")
    def ready() -> dict[str, str]:
        if app.state.embedder is None:
            raise HTTPException(status_code=503, detail="model_not_ready")
        return {"status": "ready"}

    @app.post("/v1/embeddings")
    def embeddings(request: EmbeddingRequest) -> dict[str, object]:
        active_embedder: Embedder | None = app.state.embedder
        if active_embedder is None:
            raise HTTPException(status_code=503, detail="model_not_ready")
        vectors = active_embedder.encode(request.texts)
        if len(vectors) != len(request.texts) or any(
            not _valid_vector(vector) for vector in vectors
        ):
            raise HTTPException(status_code=502, detail="embedding_response_invalid")
        return {
            "dimensions": DIMENSIONS,
            "embeddings": vectors,
            "modelId": MODEL_ID,
            "modelRevision": MODEL_REVISION,
        }

    return app


app = create_app()
