import { NextResponse } from "next/server";

import { requireAuth0Subject } from "@/lib/auth/auth0";
import {
  createTidalAuthorizationRequest,
  readTidalOAuthConfig,
} from "@/lib/tidal/oauth";

export async function GET() {
  try {
    await requireAuth0Subject();
  } catch {
    return NextResponse.redirect(
      new URL("/api/auth/login?returnTo=/onboarding", process.env.APP_BASE_URL),
    );
  }

  const request = createTidalAuthorizationRequest(readTidalOAuthConfig());
  const response = NextResponse.redirect(request.url, 302);
  const cookieOptions = {
    httpOnly: true,
    maxAge: 600,
    path: "/api/tidal",
    sameSite: "lax" as const,
    secure: true,
  };

  response.cookies.set("tidal_oauth_state", request.state, cookieOptions);
  response.cookies.set("tidal_pkce_verifier", request.verifier, cookieOptions);
  return response;
}
