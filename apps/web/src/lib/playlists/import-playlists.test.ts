import { describe, expect, it, vi } from "vitest";

import { TidalApiError } from "@/lib/tidal/api";

import {
  startPlaylistImport,
  type ImportDependencies,
} from "./import-playlists";

const playlist = {
  artworkUrl: null,
  description: null,
  id: "playlist-a",
  name: "Morning",
  saved: false,
  trackCount: 2,
};

function dependencies(overrides: Partial<ImportDependencies> = {}): ImportDependencies {
  return {
    createImport: vi.fn().mockResolvedValue({ id: "import-1" }),
    findActiveImport: vi.fn().mockResolvedValue(null),
    listPlaylists: vi.fn().mockResolvedValue([playlist]),
    savePage: vi.fn().mockResolvedValue({ playlistId: "saved-1", trackCount: 1 }),
    trackPages: vi.fn().mockReturnValue(
      (async function* () {
        yield { next: null, tracks: [] };
      })(),
    ),
    updateImport: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("playlist import service", () => {
  it("rejects an empty selection without calling TIDAL", async () => {
    const deps = dependencies();

    await expect(
      startPlaylistImport(
        { auth0Subject: "auth0|a", playlistIds: [" ", ""] },
        deps,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "playlist_selection_required" }),
    );
    expect(deps.listPlaylists).not.toHaveBeenCalled();
  });

  it("rejects a playlist that is not owned by the authenticated user", async () => {
    const deps = dependencies();

    await expect(
      startPlaylistImport(
        { auth0Subject: "auth0|a", playlistIds: ["playlist-b"] },
        deps,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "playlist_not_owned" }),
    );
    expect(deps.createImport).not.toHaveBeenCalled();
  });

  it("keeps the first stored page when the second page fails", async () => {
    const deps = dependencies({
      trackPages: vi.fn().mockReturnValue(
        (async function* () {
          yield { next: "cursor", tracks: [] };
          throw new TidalApiError("retryable");
        })(),
      ),
    });

    await expect(
      startPlaylistImport(
        { auth0Subject: "auth0|a", playlistIds: ["playlist-a"] },
        deps,
      ),
    ).rejects.toEqual(
      expect.objectContaining({ code: "tidal_retryable" }),
    );
    expect(deps.savePage).toHaveBeenCalledTimes(1);
    expect(deps.updateImport).toHaveBeenLastCalledWith(
      "auth0|a",
      "import-1",
      expect.objectContaining({ status: "failed_retryable" }),
    );
  });

  it("returns an active import for the same canonical playlist set", async () => {
    const deps = dependencies({
      findActiveImport: vi.fn().mockResolvedValue({ id: "existing-import" }),
    });

    const result = await startPlaylistImport(
      {
        auth0Subject: "auth0|a",
        playlistIds: ["playlist-a", "playlist-a"],
      },
      deps,
    );

    expect(result).toEqual({ importId: "existing-import", reused: true });
    expect(deps.createImport).not.toHaveBeenCalled();
  });
});
