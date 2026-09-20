import { requireAuth0Subject } from "@/lib/auth/auth0";
import {
  getPlaybackCredentials,
  PlaybackCredentialsError,
} from "@/lib/tidal/playback-credentials";

export async function GET() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const credentials = await getPlaybackCredentials(auth0Subject);
    return Response.json(credentials, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof PlaybackCredentialsError) {
      return Response.json({ code: error.code }, { status: 409 });
    }
    return Response.json(
      { code: "tidal_reauthentication_required" },
      { status: 401 },
    );
  }
}
