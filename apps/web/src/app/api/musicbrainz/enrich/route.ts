import { requireAuth0Subject } from "@/lib/auth/auth0";
import { enrichNextTrack } from "@/lib/musicbrainz/enrichment";

export async function POST() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await enrichNextTrack(auth0Subject));
  } catch {
    return Response.json({ code: "enrichment_failed" }, { status: 500 });
  }
}
