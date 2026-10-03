import { requireAuth0Subject } from "@/lib/auth/auth0";
import { hidePersonalizedRecommendationHistoryBatch, hidePersonalizedRecommendationHistoryTrack } from "@/lib/db/gms-recommendation-batches";
import { revalidatePath } from "next/cache";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRemoval(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.batchId !== "string" || !UUID_PATTERN.test(body.batchId)
    || (body.trackId !== undefined && (typeof body.trackId !== "string" || !UUID_PATTERN.test(body.trackId)))) {
    return null;
  }
  return { batchId: body.batchId, trackId: body.trackId as string | undefined };
}

export async function DELETE(request: Request) {
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
    return Response.json({ code: "invalid_history_track" }, { status: 400 });
  }
  const removal = parseRemoval(body);
  if (!removal) {
    return Response.json({ code: "invalid_history_track" }, { status: 400 });
  }

  try {
    const found = removal.trackId === undefined
      ? await hidePersonalizedRecommendationHistoryBatch(auth0Subject, removal.batchId)
      : await hidePersonalizedRecommendationHistoryTrack(
      auth0Subject,
      removal.batchId,
      removal.trackId,
    );
    if (!found) {
      return Response.json({ code: "history_track_not_found" }, { status: 404 });
    }
    revalidatePath("/gms");
  } catch {
    return Response.json({ code: "history_track_removal_unavailable" }, { status: 503 });
  }

  return new Response(null, { status: 204 });
}
