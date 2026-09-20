import { createHash, randomBytes } from "node:crypto";

export type TidalOAuthConfig = {
  authorizeUrl: string;
  clientId: string;
  clientSecret?: string;
  deviceAuthorizationUrl?: string;
  deviceClientId?: string;
  deviceClientSecret?: string;
  deviceScopes?: string[];
  redirectUri: string;
  scopes: string[];
  tokenUrl: string;
};

export type TidalToken = {
  accessToken: string;
  expiresIn: number;
  refreshToken: string | null;
  scope: string | null;
  userId?: string | null;
};

export function readTidalOAuthConfig(
  environment: NodeJS.ProcessEnv = process.env,
): TidalOAuthConfig {
  const clientId = environment.TIDAL_CLIENT_ID?.trim();
  const redirectUri = environment.TIDAL_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) {
    throw new Error("TIDAL_CLIENT_ID and TIDAL_REDIRECT_URI are required.");
  }

  return {
    authorizeUrl:
      environment.TIDAL_AUTHORIZE_URL?.trim() ||
      "https://login.tidal.com/authorize",
    clientId,
    clientSecret: environment.TIDAL_CLIENT_SECRET?.trim(),
    deviceClientId: environment.TIDAL_DEVICE_CLIENT_ID?.trim(),
    deviceClientSecret: environment.TIDAL_DEVICE_CLIENT_SECRET?.trim(),
    deviceAuthorizationUrl:
      environment.TIDAL_DEVICE_AUTHORIZATION_URL?.trim() ||
      "https://auth.tidal.com/v1/oauth2/device_authorization",
    deviceScopes: (environment.TIDAL_DEVICE_SCOPES || "r_usr w_usr w_sub r_stream playback entitlements.read")
      .split(/\s+/)
      .filter(Boolean),
    redirectUri,
    scopes: (environment.TIDAL_SCOPES || "playlists.read")
      .split(/\s+/)
      .filter(Boolean),
    tokenUrl:
      environment.TIDAL_TOKEN_URL?.trim() ||
      "https://auth.tidal.com/v1/oauth2/token",
  };
}

export function createTidalAuthorizationRequest(config: TidalOAuthConfig) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(config.authorizeUrl);

  url.search = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  }).toString();

  return { state, url: url.toString(), verifier };
}

async function requestToken(
  parameters: URLSearchParams,
  config: TidalOAuthConfig,
  fetcher: typeof fetch,
  fallbackRefreshToken: string | null = null,
): Promise<TidalToken> {
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  const requestBody = new URLSearchParams(parameters);
  if (config.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
    requestBody.delete("client_id");
  }
  const response = await fetcher(config.tokenUrl, {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!response.ok) {
    throw new Error("TIDAL token exchange failed.");
  }

  const body = (await response.json()) as Record<string, unknown>;
  if (typeof body.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new Error("TIDAL token response is invalid.");
  }

  return {
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    refreshToken:
      typeof body.refresh_token === "string"
        ? body.refresh_token
        : fallbackRefreshToken,
    scope: typeof body.scope === "string" ? body.scope : null,
    userId:
      typeof body.user_id === "string" || typeof body.user_id === "number"
        ? String(body.user_id)
        : null,
  };
}

export function toTidalDeviceOAuthConfig(config: TidalOAuthConfig): TidalOAuthConfig {
  return {
    ...config,
    clientId: config.deviceClientId || config.clientId,
    clientSecret: config.deviceClientSecret || config.clientSecret,
  };
}

export async function exchangeTidalCode(
  input: { code: string; verifier: string },
  config: TidalOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<TidalToken> {
  return requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      code: input.code,
      code_verifier: input.verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    config,
    fetcher,
  );
}

export async function refreshTidalToken(
  refreshToken: string,
  config: TidalOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<TidalToken> {
  return requestToken(
    new URLSearchParams({
      client_id: config.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    config,
    fetcher,
    refreshToken,
  );
}
