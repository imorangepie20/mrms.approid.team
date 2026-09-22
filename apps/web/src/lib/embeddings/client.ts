const BATCH_LIMIT = 16;
const DIMENSIONS = 768;
export const EMBEDDING_MODEL_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2";
export const EMBEDDING_MODEL_REVISION = "088a2c0bb2f721158b8350700bf0f2a250df25ae";
const REQUEST_TIMEOUT_MS = 30_000;

export type EmbeddingBatch = {
  embeddings: number[][];
  modelId: string;
  modelRevision: string;
};

export type EmbeddingClientErrorCode =
  | "embedding_batch_invalid"
  | "embedding_model_mismatch"
  | "embedding_response_invalid"
  | "embedding_service_unavailable";

export class EmbeddingClientError extends Error {
  constructor(public readonly code: EmbeddingClientErrorCode) {
    super(code);
    this.name = "EmbeddingClientError";
  }
}

function validVector(vector: unknown): vector is number[] {
  if (
    !Array.isArray(vector)
    || vector.length !== DIMENSIONS
    || vector.some((value) => typeof value !== "number" || !Number.isFinite(value))
  ) {
    return false;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm >= 0.999 && norm <= 1.001;
}

function parseBatch(body: unknown, expectedCount: number): EmbeddingBatch {
  if (!body || typeof body !== "object") {
    throw new EmbeddingClientError("embedding_response_invalid");
  }
  const candidate = body as Record<string, unknown>;
  if (
    candidate.modelId !== EMBEDDING_MODEL_ID
    || candidate.modelRevision !== EMBEDDING_MODEL_REVISION
  ) {
    throw new EmbeddingClientError("embedding_model_mismatch");
  }
  if (
    candidate.dimensions !== DIMENSIONS
    || !Array.isArray(candidate.embeddings)
    || candidate.embeddings.length !== expectedCount
    || candidate.embeddings.some((vector) => !validVector(vector))
  ) {
    throw new EmbeddingClientError("embedding_response_invalid");
  }
  return {
    embeddings: candidate.embeddings as number[][],
    modelId: EMBEDDING_MODEL_ID,
    modelRevision: EMBEDDING_MODEL_REVISION,
  };
}

export async function embedTexts(
  texts: string[],
  fetcher: typeof fetch = fetch,
): Promise<EmbeddingBatch> {
  if (
    texts.length < 1
    || texts.length > BATCH_LIMIT
    || texts.some((text) => typeof text !== "string" || text.trim().length === 0)
  ) {
    throw new EmbeddingClientError("embedding_batch_invalid");
  }

  const baseUrl = (
    process.env.EMBEDDING_SERVICE_URL?.trim() || "http://embedding:8000"
  ).replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetcher(`${baseUrl}/v1/embeddings`, {
      body: JSON.stringify({ texts }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new EmbeddingClientError("embedding_service_unavailable");
  }
  if (!response.ok) {
    throw new EmbeddingClientError("embedding_service_unavailable");
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new EmbeddingClientError("embedding_response_invalid");
  }
  return parseBatch(body, texts.length);
}
