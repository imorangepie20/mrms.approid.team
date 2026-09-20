import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { requireAuth0Subject } from "@/lib/auth/auth0";
import { encryptToken } from "@/lib/auth/token-cipher";
import { upsertUserConnection } from "@/lib/db/user-connections";
import {
  exchangeTidalCode,
  readTidalOAuthConfig,
  type TidalToken,
} from "@/lib/tidal/oauth";

type CallbackInput = {
  auth0Subject: string;
  code: string | null;
  state: string | null;
  storedState: string | null;
  verifier: string | null;
};

type CallbackDependencies = {
  exchangeCode: (code: string, verifier: string) => Promise<TidalToken>;
  persistConnection: (token: TidalToken, auth0Subject: string) => Promise<void>;
};

export async function handleTidalCallback(
  input: CallbackInput,
  dependencies: CallbackDependencies,
) {
  if (
    !input.code ||
    !input.state ||
    !input.storedState ||
    !input.verifier ||
    input.state !== input.storedState
  ) {
    return { ok: false as const, status: 400 };
  }

  const token = await dependencies.exchangeCode(input.code, input.verifier);
  await dependencies.persistConnection(token, input.auth0Subject);
  return { ok: true as const, status: 200 };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const clearCookies = (response: NextResponse) => {
    response.cookies.delete("tidal_oauth_state");
    response.cookies.delete("tidal_pkce_verifier");
    return response;
  };

  try {
    const auth0Subject = await requireAuth0Subject();
    const url = new URL(request.url);
    const config = readTidalOAuthConfig();
    const result = await handleTidalCallback(
      {
        auth0Subject,
        code: url.searchParams.get("code"),
        state: url.searchParams.get("state"),
        storedState: cookieStore.get("tidal_oauth_state")?.value ?? null,
        verifier: cookieStore.get("tidal_pkce_verifier")?.value ?? null,
      },
      {
        exchangeCode: (code, verifier) =>
          exchangeTidalCode({ code, verifier }, config),
        persistConnection: async (token, subject) => {
          const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
          if (!encryptionKey) {
            throw new Error("TOKEN_ENCRYPTION_KEY is required.");
          }

          await upsertUserConnection({
            accessTokenExpiresAt: new Date(Date.now() + token.expiresIn * 1000),
            auth0Subject: subject,
            encryptedAccessToken: encryptToken(token.accessToken, encryptionKey),
            encryptedRefreshToken: token.refreshToken
              ? encryptToken(token.refreshToken, encryptionKey)
              : null,
            scope: token.scope,
            status: "connected",
            tidalUserId: token.userId,
          });
        },
      },
    );

    if (!result.ok) {
      return clearCookies(new NextResponse("Invalid OAuth callback.", { status: result.status }));
    }

    return clearCookies(
      NextResponse.redirect(
        new URL("/onboarding?tidal=connected", process.env.APP_BASE_URL),
      ),
    );
  } catch {
    return clearCookies(new NextResponse("TIDAL connection failed.", { status: 500 }));
  }
}
