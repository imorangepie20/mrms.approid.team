import asyncio
import logging
import math

from httpx import ASGITransport, AsyncClient, Response

from services.embedding.app.main import DIMENSIONS, create_app


class FakeEmbedder:
    def encode(self, texts: list[str]) -> list[list[float]]:
        value = 1 / math.sqrt(DIMENSIONS)
        return [[value] * DIMENSIONS for _ in texts]


def request(app, method: str, path: str, json: object | None = None) -> Response:
    async def send() -> Response:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            return await client.request(method, path, json=json)

    return asyncio.run(send())


def test_embeds_a_batch_without_logging_input(caplog):
    caplog.set_level(logging.INFO)
    response = request(
        create_app(FakeEmbedder()),
        "POST",
        "/v1/embeddings",
        json={"texts": ["Blue | Joni Mitchell | Blue | folk"]},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["dimensions"] == 768
    assert len(body["embeddings"][0]) == 768
    assert "Joni Mitchell" not in caplog.text


def test_rejects_empty_or_oversized_batches():
    app = create_app(FakeEmbedder())
    assert request(app, "POST", "/v1/embeddings", json={"texts": []}).status_code == 422
    assert request(
        app,
        "POST",
        "/v1/embeddings",
        json={"texts": ["x"] * 17},
    ).status_code == 422


def test_rejects_blank_text_and_invalid_vectors():
    assert request(
        create_app(FakeEmbedder()),
        "POST",
        "/v1/embeddings",
        json={"texts": ["   "]},
    ).status_code == 422

    class WrongDimensions:
        def encode(self, texts: list[str]) -> list[list[float]]:
            return [[1.0] for _ in texts]

    response = request(
        create_app(WrongDimensions()),
        "POST",
        "/v1/embeddings",
        json={"texts": ["valid"]},
    )
    assert response.status_code == 502


def test_health_endpoints_report_process_and_model_readiness():
    app = create_app(FakeEmbedder())

    assert request(app, "GET", "/health/live").json() == {"status": "live"}
    assert request(app, "GET", "/health/ready").json() == {"status": "ready"}
