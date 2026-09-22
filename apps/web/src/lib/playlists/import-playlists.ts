import {
  createImport,
  findActiveImport,
  getPlaylistImportById,
  updateImport,
  upsertPlaylistPage,
  type UpdateImportInput,
} from "@/lib/db/music-library";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import { stageImportedTidalTracks } from "@/lib/ems/import-user-tracks";
import type { PositionedTrack } from "@/lib/music/library-types";
import {
  getPlaylistTrackPages,
  listUserPlaylists,
  TidalApiError,
  type TidalPlaylistSummary,
} from "@/lib/tidal/api";

export class ImportError extends Error {
  constructor(
    public readonly code:
      | "playlist_selection_required"
      | "playlist_not_owned"
      | "tidal_retryable"
      | "tidal_reauthentication_required"
      | "playlist_import_failed",
  ) {
    super(code);
  }
}

type TrackPage = { next: string | null; tracks: PositionedTrack[] };

export type ImportDependencies = {
  createImport: (auth0Subject: string, playlistIds: string[]) => Promise<{ id: string }>;
  findActiveImport: (
    auth0Subject: string,
    playlistIds: string[],
  ) => Promise<{ id: string } | null>;
  listPlaylists: (auth0Subject: string) => Promise<TidalPlaylistSummary[]>;
  savePage: (
    auth0Subject: string,
    playlist: TidalPlaylistSummary,
    tracks: PositionedTrack[],
  ) => Promise<{ playlistId: string; trackCount: number }>;
  trackPages: (
    auth0Subject: string,
    playlistId: string,
  ) => AsyncIterable<TrackPage>;
  updateImport: (
    auth0Subject: string,
    importId: string,
    update: UpdateImportInput,
  ) => Promise<unknown>;
};

function tidalCredentials(token: { accessToken: string }) {
  return {
    accessToken: token.accessToken,
    apiBaseUrl:
      process.env.TIDAL_API_BASE_URL?.trim() ||
      "https://openapi.tidal.com/v2",
    countryCode: process.env.TIDAL_COUNTRY_CODE?.trim() || "KR",
  };
}

const productionDependencies: ImportDependencies = {
  createImport,
  findActiveImport,
  listPlaylists: async (auth0Subject) => {
    const token = await getUsableTidalAccessToken(auth0Subject);
    const credentials = tidalCredentials(token);
    const playlists: TidalPlaylistSummary[] = [];
    let next: string | undefined;
    do {
      const page = await listUserPlaylists(credentials, fetch, next);
      playlists.push(...page.items);
      next = page.next ?? undefined;
    } while (next);
    return playlists;
  },
  savePage: async (auth0Subject, playlist, tracks) => {
    const saved = await upsertPlaylistPage({
      auth0Subject,
      playlist: {
        description: playlist.description,
        name: playlist.name,
        tidalArtworkUrl: playlist.artworkUrl,
        tidalPlaylistId: playlist.id,
      },
      tracks,
    });
    await stageImportedTidalTracks(auth0Subject, tracks.map((item) => item));
    return saved;
  },
  trackPages: async function* (auth0Subject, playlistId) {
    const token = await getUsableTidalAccessToken(auth0Subject);
    yield* getPlaylistTrackPages(playlistId, tidalCredentials(token));
  },
  updateImport,
};

export async function startPlaylistImport(
  input: { auth0Subject: string; playlistIds: string[] },
  dependencies: ImportDependencies = productionDependencies,
) {
  const requestedIds = [
    ...new Set(input.playlistIds.map((id) => id.trim()).filter(Boolean)),
  ].sort();
  if (requestedIds.length === 0) {
    throw new ImportError("playlist_selection_required");
  }

  const owned = await dependencies.listPlaylists(input.auth0Subject);
  if (requestedIds.some((id) => !owned.some((playlist) => playlist.id === id))) {
    throw new ImportError("playlist_not_owned");
  }

  const active = await dependencies.findActiveImport(
    input.auth0Subject,
    requestedIds,
  );
  if (active) return { importId: active.id, reused: true };

  const imported = await dependencies.createImport(
    input.auth0Subject,
    requestedIds,
  );
  await dependencies.updateImport(input.auth0Subject, imported.id, {
    startedAt: new Date(),
    status: "running",
  });

  let savedPlaylistCount = 0;
  let savedTrackCount = 0;
  try {
    for (const playlistId of requestedIds) {
      const playlist = owned.find((candidate) => candidate.id === playlistId)!;
      for await (const page of dependencies.trackPages(
        input.auth0Subject,
        playlistId,
      )) {
        await dependencies.savePage(
          input.auth0Subject,
          playlist,
          page.tracks,
        );
        savedTrackCount += page.tracks.length;
        await dependencies.updateImport(input.auth0Subject, imported.id, {
          savedPlaylistCount,
          savedTrackCount,
        });
      }
      savedPlaylistCount += 1;
      await dependencies.updateImport(input.auth0Subject, imported.id, {
        savedPlaylistCount,
        savedTrackCount,
      });
    }
    await dependencies.updateImport(input.auth0Subject, imported.id, {
      completedAt: new Date(),
      errorCode: null,
      savedPlaylistCount,
      savedTrackCount,
      status: "completed",
    });
    return { importId: imported.id, reused: false };
  } catch (error) {
    const code =
      error instanceof TidalApiError && error.kind === "retryable"
        ? "tidal_retryable"
        : error instanceof TidalApiError && error.kind === "reauthenticate"
          ? "tidal_reauthentication_required"
          : "playlist_import_failed";
    await dependencies.updateImport(input.auth0Subject, imported.id, {
      errorCode: code,
      savedPlaylistCount,
      savedTrackCount,
      status: code === "tidal_retryable" ? "failed_retryable" : "failed",
    });
    throw new ImportError(code);
  }
}

export async function getPlaylistImport(
  auth0Subject: string,
  importId: string,
) {
  return getPlaylistImportById(auth0Subject, importId);
}
