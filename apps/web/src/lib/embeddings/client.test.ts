import { afterEach, describe, expect, it, vi } from "vitest";

import { embedTexts } from "./client";

const MODEL_ID = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2";
const MODEL_REVISION = "088a2c0bb2f721158b8350700bf0f2a250df25ae";

function unitVector() {
  return [1, ...Array.from({ length: 767 }, () => 0)];
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    dimensions: 768,
    embeddings: [unitVector()],
    modelId: MODEL_ID,
    modelRevision: MODEL_REVISION,
    ...overrides,
  };
}

function fakeFetch(body: unknown, ok = true) {
  return vi.fn(async () => ({
    json: async () => body,
    ok,
  })) as unknown as typeof fetch;
}

describe("embedding service client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.EMBEDDING_SERVICE_URL;
  });

  it("posts no more than 16 texts and accepts normalized 768-dimensional vectors", async () => {
    process.env.EMBEDDING_SERVICE_URL = "http://embedding.test:8000/";
    const texts = Array.from({ length: 16 }, (_, index) => `track-${index}`);
    const fetcher = fakeFetch(response({
      embeddings: texts.map(() => unitVector()),
    }));

    await expect(embedTexts(texts, fetcher)).resolves.toEqual({
      embeddings: texts.map(() => unitVector()),
      modelId: MODEL_ID,
      modelRevision: MODEL_REVISION,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://embedding.test:8000/v1/embeddings",
      expect.objectContaining({
        body: JSON.stringify({ texts }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    const oversizedFetcher = fakeFetch(response());
    await expect(
      embedTexts([...texts, "track-16"], oversizedFetcher),
    ).rejects.toMatchObject({ code: "embedding_batch_invalid" });
    expect(oversizedFetcher).not.toHaveBeenCalled();
  });

  it("rejects a model revision mismatch", async () => {
    await expect(
      embedTexts(
        ["track-a"],
        fakeFetch(response({ modelRevision: "unexpected-revision" })),
      ),
    ).rejects.toMatchObject({ code: "embedding_model_mismatch" });
  });

  it.each([
    ["NaN", [Number.NaN, ...Array.from({ length: 767 }, () => 0)]],
    ["Infinity", [Number.POSITIVE_INFINITY, ...Array.from({ length: 767 }, () => 0)]],
    ["wrong vector length", [1, 0]],
  ])("rejects %s in a model response", async (_label, vector) => {
    await expect(
      embedTexts(
        ["track-a"],
        fakeFetch(response({ embeddings: [vector] })),
      ),
    ).rejects.toMatchObject({ code: "embedding_response_invalid" });
  });

  it("aborts the request after 30 seconds", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }),
    ) as unknown as typeof fetch;

    const pending = embedTexts(["track-a"], fetcher);
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: "embedding_service_unavailable",
    });
    expect(timeout).toHaveBeenCalledWith(30_000);
  });
});
