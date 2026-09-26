import { requireAuth0Subject } from "@/lib/auth/auth0";
import { deleteUserLike, upsertUserLike } from "@/lib/db/user-likes";
import { refreshTasteProfileFromActions } from "@/lib/embeddings/jobs";
import { parseLikeKey, parseLikeSnapshot } from "@/lib/likes/types";

type LikeRouteContext = {
  params: Promise<{
    entityType: string;
    source: string;
    sourceId: string;
  }>;
};

const maximumSnapshotBytes = 16_384;

async function snapshotFromRequest(request: Request, entityType: string) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumSnapshotBytes) {
    throw new Error("like_payload_too_large");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maximumSnapshotBytes) {
    throw new Error("like_payload_too_large");
  }
  return parseLikeSnapshot(entityType, JSON.parse(body));
}

async function keyFromContext(context: LikeRouteContext) {
  const { entityType, source, sourceId } = await context.params;
  return parseLikeKey(entityType, source, sourceId);
}

async function authenticatedSubject() {
  try {
    return await requireAuth0Subject();
  } catch {
    return null;
  }
}

export async function PUT(request: Request, context: LikeRouteContext) {
  let key: ReturnType<typeof parseLikeKey>;
  let snapshot: ReturnType<typeof parseLikeSnapshot>;
  try {
    key = await keyFromContext(context);
    snapshot = await snapshotFromRequest(request, key.entityType);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "like_payload_too_large") {
      return Response.json({ code: message }, { status: 413 });
    }
    const code = message.startsWith("invalid_like_") ? message : "invalid_like_snapshot";
    return Response.json({ code }, { status: 400 });
  }

  const auth0Subject = await authenticatedSubject();
  if (!auth0Subject) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  let item: Awaited<ReturnType<typeof upsertUserLike>>;
  try {
    item = await upsertUserLike(auth0Subject, { ...key, ...snapshot });
  } catch {
    return Response.json({ code: "like_write_failed" }, { status: 500 });
  }
  if (key.entityType === "track") {
    try {
      await refreshTasteProfileFromActions(auth0Subject);
    } catch {
      return Response.json(
        { code: "taste_profile_refresh_failed", item, liked: true },
        { status: 503 },
      );
    }
  }
  return Response.json({ item, liked: true });
}

export async function DELETE(_request: Request, context: LikeRouteContext) {
  let key: ReturnType<typeof parseLikeKey>;
  try {
    key = await keyFromContext(context);
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_like_id";
    return Response.json({ code }, { status: 400 });
  }

  const auth0Subject = await authenticatedSubject();
  if (!auth0Subject) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    await deleteUserLike(auth0Subject, key);
  } catch {
    return Response.json({ code: "like_delete_failed" }, { status: 500 });
  }
  if (key.entityType === "track") {
    try {
      await refreshTasteProfileFromActions(auth0Subject);
    } catch {
      return Response.json(
        { code: "taste_profile_refresh_failed", liked: false },
        { status: 503 },
      );
    }
  }
  return Response.json({ liked: false });
}
