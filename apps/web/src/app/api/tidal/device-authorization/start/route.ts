import { requireAuth0Subject } from "@/lib/auth/auth0";
import { startTidalDeviceAuthorization } from "@/lib/tidal/device-authorization";
import { readTidalOAuthConfig } from "@/lib/tidal/oauth";

export async function POST() {
  try {
    await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  try {
    const authorization = await startTidalDeviceAuthorization(readTidalOAuthConfig());
    return Response.json(authorization, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ code: "tidal_device_authorization_failed" }, { status: 502 });
  }
}
