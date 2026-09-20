import { requireAuth0Subject } from "@/lib/auth/auth0";
import { disconnectTidal } from "@/lib/db/music-library";

export async function POST() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await disconnectTidal(auth0Subject));
  } catch {
    return Response.json({ code: "tidal_disconnect_failed" }, { status: 500 });
  }
}
