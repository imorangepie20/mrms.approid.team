import { describe, expect, it, vi } from "vitest";

import {
  deleteUserLike,
  getUserLikes,
  upsertUserLike,
} from "./user-likes";

const row = {
  artwork_url: "https://resources.tidal.com/cover.jpg",
  created_at: new Date("2026-09-21T00:00:00.000Z"),
  entity_type: "track",
  metadata: { album: "Homogenic", playbackAvailable: true },
  source: "tidal",
  source_id: "42",
  subtitle: "Björk",
  title: "Jóga",
};

describe("user likes repository", () => {
  it("maps liked items and scopes reads to the Auth0 subject", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [row] }) };

    await expect(getUserLikes("auth0|listener-a", database)).resolves.toEqual([{
      artworkUrl: row.artwork_url,
      createdAt: "2026-09-21T00:00:00.000Z",
      entityType: "track",
      metadata: row.metadata,
      source: "tidal",
      sourceId: "42",
      subtitle: "Björk",
      title: "Jóga",
    }]);

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/u\.auth0_subject = \$1/),
      ["auth0|listener-a"],
    );
  });

  it("upserts using the complete per-user identity", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [row] }) };

    await upsertUserLike("auth0|listener-a", {
      artworkUrl: row.artwork_url,
      entityType: "track",
      metadata: row.metadata,
      source: "tidal",
      sourceId: "42",
      subtitle: "Björk",
      title: "Jóga",
    }, database);

    expect(database.query.mock.calls[0][0]).toMatch(
      /ON CONFLICT \(user_id, entity_type, source, source_id\)/,
    );
    expect(database.query.mock.calls[0][1]).toEqual([
      "auth0|listener-a",
      "track",
      "tidal",
      "42",
      "Jóga",
      "Björk",
      row.artwork_url,
      JSON.stringify(row.metadata),
    ]);
  });

  it("deletes only a matching item owned by the Auth0 subject", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [{ id: "like-1" }] }) };

    await expect(deleteUserLike("auth0|listener-b", {
      entityType: "playlist",
      source: "tidal",
      sourceId: "playlist-7",
    }, database)).resolves.toBe(true);

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM user_likes[\s\S]*u\.auth0_subject = \$1/),
      ["auth0|listener-b", "playlist", "tidal", "playlist-7"],
    );
  });
});
