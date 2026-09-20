import { getUsableTidalAccessToken } from "@/lib/db/user-connections";

import { readTidalOAuthConfig, type TidalOAuthConfig } from "./oauth";

export class PlaybackCredentialsError extends Error {
  constructor(public readonly code: "tidal_playback_scope_required") {
    super(code);
  }
}

type PlaybackCredentialsDependencies = {
  getAccessToken?: typeof getUsableTidalAccessToken;
  readConfig?: () => TidalOAuthConfig;
};

export async function getPlaybackCredentials(
  auth0Subject: string,
  dependencies: PlaybackCredentialsDependencies = {},
) {
  const getAccessToken =
    dependencies.getAccessToken ?? getUsableTidalAccessToken;
  const readConfig = dependencies.readConfig ?? readTidalOAuthConfig;
  const [token, config] = await Promise.all([
    getAccessToken(auth0Subject),
    Promise.resolve(readConfig()),
  ]);
  const grantedScopes = token.scope?.split(/\s+/).filter(Boolean) ?? [];
  if (!grantedScopes.includes("playback")) {
    throw new PlaybackCredentialsError("tidal_playback_scope_required");
  }

  return {
    clientId: config.clientId,
    expires: token.expiresAt.getTime(),
    grantedScopes,
    requestedScopes: config.scopes,
    token: token.accessToken,
  };
}
