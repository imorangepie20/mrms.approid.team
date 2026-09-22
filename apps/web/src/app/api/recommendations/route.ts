import { requireAuth0Subject } from "@/lib/auth/auth0";
import { listPersonalizedEmsRecommendations } from "@/lib/db/gms-recommendations";

const MAX_LIMIT = 24;

export async function GET(request: Request) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? 12 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return Response.json({ code: "invalid_limit" }, { status: 400 });
  }

  try {
    return Response.json(await listPersonalizedEmsRecommendations(auth0Subject, limit));
  } catch {
    return Response.json({ code: "recommendations_unavailable" }, { status: 503 });
  }
}
