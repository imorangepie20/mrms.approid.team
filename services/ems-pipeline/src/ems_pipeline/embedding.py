from __future__ import annotations

from hashlib import sha256
from typing import Any, Callable

import httpx

MODEL_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
MODEL_REVISION = "088a2c0bb2f721158b8350700bf0f2a250df25ae"
DIMENSIONS = 768


def build_embedding_text(row: dict[str, Any]) -> str:
    return " | ".join(
        str(value).strip()
        for value in (row.get("title"), row.get("artist"), row.get("album"))
        if value and str(value).strip()
    )


def _input_hash(text: str) -> str:
    return sha256(f"{MODEL_REVISION}\0{text}".encode("utf-8")).hexdigest()


def embed_remote(texts: list[str], base_url: str) -> list[list[float]]:
    response = httpx.post(
        f"{base_url.rstrip('/')}/v1/embeddings",
        json={"texts": texts},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if (
        payload.get("modelId") != MODEL_ID
        or payload.get("modelRevision") != MODEL_REVISION
        or payload.get("dimensions") != DIMENSIONS
        or not isinstance(payload.get("embeddings"), list)
    ):
        raise ValueError("embedding_response_invalid")
    return payload["embeddings"]


def embed_ems_batch(
    connection: Any,
    embed: Callable[[list[str]], list[list[float]]],
    *,
    limit: int = 16,
) -> dict[str, int]:
    safe_limit = max(1, min(16, int(limit)))
    rows = connection.execute(
        """
        SELECT e.id, e.title, e.artist, e.album
        FROM ems_tracks AS e
        LEFT JOIN ems_track_embeddings AS embedding ON embedding.track_id = e.id
        WHERE e.status = 'active'
          AND (embedding.track_id IS NULL OR embedding.status <> 'completed')
        ORDER BY e.id
        LIMIT %s
        """,
        (safe_limit,),
    ).fetchall()
    if not rows:
        return {"embedded": 0, "remaining": 0}

    normalized = [dict(row) for row in rows]
    texts = [build_embedding_text(row) for row in normalized]
    vectors = embed(texts)
    if len(vectors) != len(normalized) or any(len(vector) != DIMENSIONS for vector in vectors):
        raise ValueError("embedding_response_invalid")

    for row, text, vector in zip(normalized, texts, vectors, strict=True):
        connection.execute(
            """
            INSERT INTO ems_track_embeddings
              (track_id, model_id, model_revision, input_hash, status, embedding, updated_at)
            VALUES (%s, %s, %s, %s, 'completed', %s::vector, now())
            ON CONFLICT (track_id) DO UPDATE SET
              model_id = EXCLUDED.model_id,
              model_revision = EXCLUDED.model_revision,
              input_hash = EXCLUDED.input_hash,
              status = 'completed',
              embedding = EXCLUDED.embedding,
              last_error_code = NULL,
              updated_at = now()
            """,
            (row["id"], MODEL_ID, MODEL_REVISION, _input_hash(text), str(vector)),
        )
    return {"embedded": len(normalized), "remaining": len(normalized)}
