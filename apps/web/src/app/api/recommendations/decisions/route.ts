import { revalidatePath } from "next/cache";
import { requireAuth0Subject } from "@/lib/auth/auth0";
import { refreshTasteProfileFromActions } from "@/lib/embeddings/jobs";
import {
  saveRecommendationDecision,
  type RecommendationDecision,
} from "@/lib/db/gms-recommendations";

const decisions = new Set<RecommendationDecision["decision"]>([
  "accept",
  "reject",
  "skip",
]);

function parseDecision(value: unknown): RecommendationDecision | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const rankingVersion = body.rankingVersion ?? "baseline";
  const valid = typeof body.sourceTrackId === "string"
    && body.sourceTrackId.trim().length > 0
    && typeof body.profileVersion === "string"
    && body.profileVersion.trim().length > 0
    && (rankingVersion === "baseline" || rankingVersion === "hybrid-v0")
    && typeof body.decision === "string"
    && decisions.has(body.decision as RecommendationDecision["decision"])
    && Array.isArray(body.reasonCodes)
    && body.reasonCodes.every((code) => typeof code === "string")
    && Boolean(body.scoreComponents)
    && typeof body.scoreComponents === "object"
    && Object.values(body.scoreComponents as Record<string, unknown>)
      .every((score) => typeof score === "number" && Number.isFinite(score));
  if (!valid) return null;
  return {
    decision: body.decision as RecommendationDecision["decision"],
    profileVersion: body.profileVersion as string,
    rankingVersion: rankingVersion as RecommendationDecision["rankingVersion"],
    reasonCodes: body.reasonCodes as string[],
    scoreComponents: body.scoreComponents as Record<string, number>,
    sourceTrackId: body.sourceTrackId as string,
  };
}

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
    return Response.json({ code: "invalid_decision" }, { status: 400 });
  }
  const decision = parseDecision(body);
  if (!decision) {
    return Response.json({ code: "invalid_decision" }, { status: 400 });
  }

  try {
    await saveRecommendationDecision(auth0Subject, decision);
  } catch (error) {
    if (error instanceof Error && error.message === "recommendation_user_not_found") {
      return Response.json({ code: "user_not_found" }, { status: 404 });
    }
    return Response.json({ code: "decision_unavailable" }, { status: 503 });
  }

  revalidatePath("/gms");
  revalidatePath("/gms/history");
  revalidatePath("/mms");

  if (decision.decision !== "skip") {
    try {
      await refreshTasteProfileFromActions(auth0Subject);
    } catch {
      return Response.json(
        { code: "taste_profile_refresh_failed", decisionSaved: true },
        { status: 503 },
      );
    }
  }
  return new Response(null, { status: 204 });
}
