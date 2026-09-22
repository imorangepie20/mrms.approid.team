from typing import Protocol

MODEL_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
MODEL_REVISION = "088a2c0bb2f721158b8350700bf0f2a250df25ae"
DIMENSIONS = 768


class Embedder(Protocol):
    def encode(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    def __init__(self) -> None:
        from sentence_transformers import SentenceTransformer

        self.model = SentenceTransformer(MODEL_ID, revision=MODEL_REVISION)

    def encode(self, texts: list[str]) -> list[list[float]]:
        vectors = self.model.encode(
            texts,
            batch_size=16,
            normalize_embeddings=True,
        )
        return vectors.astype("float32").tolist()
