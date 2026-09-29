import { after } from "next/server";

import { requireAuth0Subject } from "@/lib/auth/auth0";
import { rotatePersonalizedRecommendationBatch } from "@/lib/db/gms-recommendation-batches";
import { recordRecommendationShadow } from "@/lib/db/gms-recommendations";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "invalid_request" }, { status: 400 });
  }
  const currentBatchId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as { currentBatchId?: unknown }).currentBatchId
    : null;
  if (typeof currentBatchId !== "string" || !UUID_PATTERN.test(currentBatchId)) {
    return Response.json({ code: "invalid_batch_id" }, { status: 400 });
  }

  try {
    const batch = await rotatePersonalizedRecommendationBatch(
      auth0Subject,
      currentBatchId,
      12,
    );
    if (batch.shadow && batch.serving) {
      after(async () => {
        await recordRecommendationShadow(auth0Subject, batch.shadow!, batch.serving!)
          .catch(() => undefined);
      });
    }
    return Response.json({
      batchId: batch.batchId,
      createdAt: batch.createdAt,
      exhausted: batch.exhausted,
      recommendations: batch.recommendations,
    });
  } catch {
    return Response.json({ code: "recommendations_unavailable" }, { status: 503 });
  }
}
