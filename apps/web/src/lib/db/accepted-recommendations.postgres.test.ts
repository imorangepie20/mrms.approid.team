import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import type { TransactionExecutor } from "./music-library";
import { getAcceptedRecommendationTracks, saveRecommendationDecision } from "./gms-recommendations";

const databaseUrl = process.env.RECOMMENDATION_SHADOW_TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(databaseUrl));
const userIds = ["aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2"];
const trackIds = ["bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2"];
let pool: Pool;
let client: PoolClient;

suite("accepted recommendation MMS persistence", () => {
  beforeAll(async () => {
    pool = new Pool({connectionString:databaseUrl});
    client = await pool.connect();
    await client.query("INSERT INTO app_users (id, auth0_subject) VALUES ($1, 'auth0|gms-fix-a'), ($2, 'auth0|gms-fix-b')", userIds);
    for (const [index, id] of trackIds.entries()) {
      await client.query(`INSERT INTO ems_tracks (id, tidal_id, title, artist, album, duration_ms, status, match_confidence)
        VALUES ($1, $2, $3, 'Artist', 'Album', 180000, $4, 1)`,
      [id, `98765${index}`, `Accepted ${index}`, index ? "inactive" : "active"]);
    }
    await client.query("INSERT INTO ems_availability_events (track_id, region, capability, playable) VALUES ($1, 'KR', 'STREAM', true)", [trackIds[0]]);
  });

  afterAll(async () => {
    if (client) {
      await client.query("DELETE FROM app_users WHERE id = ANY($1::uuid[])", [userIds]);
      await client.query("DELETE FROM ems_tracks WHERE id = ANY($1::uuid[])", [trackIds]);
      client.release();
    }
    await pool?.end();
  });

  const save = (subject: string, decision: "accept" | "reject", trackId = trackIds[0]) =>
    saveRecommendationDecision(subject, {
      decision, sourceTrackId:trackId, profileVersion:"taste-v1", rankingVersion:"baseline",
      reasonCodes:["taste_match"], scoreComponents:{similarity:0.9},
    }, client as unknown as TransactionExecutor);
  const load = (subject: string) => getAcceptedRecommendationTracks(subject, client as unknown as TransactionExecutor);

  it("returns committed accepts after reloading, deduplicates, and keeps hearts separate", async () => {
    await save("auth0|gms-fix-a", "accept");
    await save("auth0|gms-fix-a", "accept");
    await save("auth0|gms-fix-a", "accept", trackIds[1]);
    expect(await load("auth0|gms-fix-b")).toEqual([]);
    const first = await load("auth0|gms-fix-a");
    expect(first).toEqual([expect.objectContaining({id:trackIds[0],title:"Accepted 0",tidalTrackId:"987650",durationSeconds:180,playbackAvailable:true})]);
    expect(await load("auth0|gms-fix-a")).toEqual(first);
    const hearts = await client.query("SELECT count(*)::int AS count FROM user_likes WHERE user_id = $1", [userIds[0]]);
    expect(hearts.rows[0].count).toBe(0);
  });

  it("permanently excludes a rejection even after accept, without affecting another user or EMS", async () => {
    await save("auth0|gms-fix-b", "accept");
    await save("auth0|gms-fix-a", "reject");
    await save("auth0|gms-fix-a", "accept");
    expect(await load("auth0|gms-fix-a")).toEqual([]);
    expect(await load("auth0|gms-fix-b")).toHaveLength(1);
    const original = await client.query("SELECT status FROM ems_tracks WHERE id = $1", [trackIds[0]]);
    expect(original.rows[0].status).toBe("active");
  });

  it("keeps the accepted track visible but disables playback using the latest KR availability", async () => {
    await client.query("INSERT INTO ems_availability_events (track_id, region, capability, playable) VALUES ($1, 'KR', 'STREAM', false)", [trackIds[0]]);
    expect(await load("auth0|gms-fix-b")).toEqual([expect.objectContaining({id:trackIds[0],playbackAvailable:false})]);
  });
});
