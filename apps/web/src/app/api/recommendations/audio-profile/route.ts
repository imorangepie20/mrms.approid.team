import { requireAuth0Subject } from "@/lib/auth/auth0";
import { refreshAudioTasteProfile } from "@/lib/db/audio-taste-profiles";

export async function POST() {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await refreshAudioTasteProfile(auth0Subject));
  } catch {
    return Response.json({ code: "audio_taste_profile_refresh_failed" }, { status: 500 });
  }
}
