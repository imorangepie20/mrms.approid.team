import { requireAuth0Subject } from "@/lib/auth/auth0";
import { storeTidalDeviceToken } from "@/lib/db/user-connections";
import { pollTidalDeviceAuthorization } from "@/lib/tidal/device-authorization";
import { readTidalOAuthConfig } from "@/lib/tidal/oauth";

export async function POST(request: Request) {
  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  let deviceCode: string;
  try {
    const body = (await request.json()) as { deviceCode?: unknown };
    deviceCode = typeof body.deviceCode === "string" ? body.deviceCode.trim() : "";
  } catch {
    deviceCode = "";
  }
  if (!deviceCode) {
    return Response.json({ code: "invalid_device_code" }, { status: 400 });
  }
  try {
    const result = await pollTidalDeviceAuthorization(
      deviceCode,
      readTidalOAuthConfig(),
    );
    if (result.status !== "connected") {
      return Response.json(result, {
        status: 202,
        headers: { "cache-control": "no-store" },
      });
    }
    await storeTidalDeviceToken(auth0Subject, result.token);
    return Response.json({ status: "connected" }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return Response.json({ code: "tidal_device_authorization_failed" }, { status: 502 });
  }
}
