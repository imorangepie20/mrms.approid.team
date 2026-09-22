import { requireAuth0Subject } from "@/lib/auth/auth0";
import {
  saveRecommendationDecision,
  type RecommendationDecision,
} from "@/lib/db/gms-recommendations";

const decisions = new Set<RecommendationDecision["decision"]>([
  "accept",
  "reject",
  "skip",
]);

function isDecision(value: unknown): value is RecommendationDecision {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return typeof body.sourceTrackId === "string"
    && body.sourceTrackId.trim().length > 0
    && typeof body.profileVersion === "string"
    && body.profileVersion.trim().length > 0
    && typeof body.decision === "string"
    && decisions.has(body.decision as RecommendationDecision["decision"])
    && Array.isArray(body.reasonCodes)
    && body.reasonCodes.every((code) => typeof code === "string")
    && Boolean(body.scoreComponents)
    && typeof body.scoreComponents === "object"
    && Object.values(body.scoreComponents as Record<string, unknown>)
      .every((score) => typeof score === "number" && Number.isFinite(score));
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
  if (!isDecision(body)) {
    return Response.json({ code: "invalid_decision" }, { status: 400 });
  }

  try {
    await saveRecommendationDecision(auth0Subject, body);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Error && error.message === "recommendation_user_not_found") {
      return Response.json({ code: "user_not_found" }, { status: 404 });
    }
    return Response.json({ code: "decision_unavailable" }, { status: 503 });
  }
}
