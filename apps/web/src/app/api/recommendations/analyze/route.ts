import { requireAuth0Subject } from "@/lib/auth/auth0";
import { EmbeddingClientError } from "@/lib/embeddings/client";
import { processEmbeddingBatch } from "@/lib/embeddings/jobs";

export async function POST() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await processEmbeddingBatch(auth0Subject));
  } catch (error) {
    if (error instanceof EmbeddingClientError) {
      if (error.code === "embedding_service_unavailable") {
        return Response.json({ code: error.code }, { status: 503 });
      }
      if (
        error.code === "embedding_response_invalid"
        || error.code === "embedding_model_mismatch"
      ) {
        return Response.json({ code: error.code }, { status: 502 });
      }
    }
    return Response.json({ code: "taste_analysis_failed" }, { status: 500 });
  }
}
