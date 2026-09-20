import { toTidalDeviceOAuthConfig, type TidalOAuthConfig, type TidalToken } from "./oauth";

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export type TidalDeviceAuthorization = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresAt: Date;
  intervalSeconds: number;
};

export type TidalDevicePollResult =
  | { status: "authorization_pending" | "slow_down" }
  | { status: "connected"; token: TidalToken };

export class TidalDeviceAuthorizationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TidalDeviceAuthorizationError";
  }
}

function text(body: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function number(body: Record<string, unknown>, fallback: number, ...keys: string[]) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return fallback;
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

export async function startTidalDeviceAuthorization(
  config: TidalOAuthConfig,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<TidalDeviceAuthorization> {
  const deviceConfig = toTidalDeviceOAuthConfig(config);
  const response = await fetcher(
    config.deviceAuthorizationUrl || "https://auth.tidal.com/v1/oauth2/device_authorization",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: deviceConfig.clientId,
        scope: (config.deviceScopes ?? config.scopes).join(" "),
      }),
    },
  );
  const body = await json(response);
  if (!response.ok) {
    const unsupportedClient =
      body.sub_status === 1002 ||
      text(body, "error_description")?.includes("Limited Input Device");
    throw new TidalDeviceAuthorizationError(
      unsupportedClient
        ? "tidal_device_client_unsupported"
        : "tidal_device_authorization_failed",
    );
  }
  const deviceCode = text(body, "device_code", "deviceCode");
  const userCode = text(body, "user_code", "userCode");
  const verificationUri = text(body, "verification_uri", "verificationUri");
  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error("tidal_device_authorization_invalid");
  }
  const expiresIn = number(body, 300, "expires_in", "expiresIn");
  return {
    deviceCode,
    userCode,
    verificationUri,
    verificationUriComplete: text(body, "verification_uri_complete", "verificationUriComplete"),
    expiresAt: new Date(now() + expiresIn * 1000),
    intervalSeconds: number(body, 5, "interval"),
  };
}

export async function pollTidalDeviceAuthorization(
  deviceCode: string,
  config: TidalOAuthConfig,
  fetcher: typeof fetch = fetch,
): Promise<TidalDevicePollResult> {
  const deviceConfig = toTidalDeviceOAuthConfig(config);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (deviceConfig.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${deviceConfig.clientId}:${deviceConfig.clientSecret}`).toString("base64")}`;
  }
  const response = await fetcher(config.tokenUrl, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      client_id: deviceConfig.clientId,
      device_code: deviceCode,
      grant_type: DEVICE_GRANT_TYPE,
    }),
  });
  const body = await json(response);
  const providerError = text(body, "error");
  if (!response.ok) {
    if (providerError === "authorization_pending" || providerError === "slow_down") {
      return { status: providerError };
    }
    throw new Error("tidal_device_token_failed");
  }
  const accessToken = text(body, "access_token");
  const expiresIn = number(body, 0, "expires_in");
  if (!accessToken || expiresIn <= 0) throw new Error("tidal_device_token_invalid");
  const userId = body.user_id;
  return {
    status: "connected",
    token: {
      accessToken,
      expiresIn,
      refreshToken: text(body, "refresh_token"),
      scope: text(body, "scope"),
      userId: typeof userId === "string" || typeof userId === "number" ? String(userId) : null,
    },
  };
}
