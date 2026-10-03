import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAllPersonalizedRecommendationHistory, getOrCreatePersonalizedRecommendationBatch, hidePersonalizedRecommendationHistoryBatch, hidePersonalizedRecommendationHistoryTrack } from "./gms-recommendation-batches";
import type { TransactionExecutor } from "./music-library";

const url = process.env.GMS_GROUP_TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
const userId = "11111111-1111-4111-8111-111111111111";
const batchId = "22222222-2222-4222-8222-222222222222";
const pastId = "33333333-3333-4333-8333-333333333333";
const trackId = "44444444-4444-4444-8444-444444444444";
const pastTrackId = "55555555-5555-4555-8555-555555555555";
const emptyId = "66666666-6666-4666-8666-666666666666";
let pool: Pool;
let client: PoolClient;
let database: TransactionExecutor;
const snapshot = (id: string) => ({profileReady:true, profileVersion:"ems-v1",rankingVersion:"baseline",tracks:[{id,title:"Fixture",artist:"Artist",album:"Album",artworkClass:"",artworkUrl:"",tidalTrackId:id}]});
const migration = (name: string) => readFile(join(process.cwd(), "src/lib/db/migrations", name), "utf8");

suite("grouped GMS isolated PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({connectionString:url}); client = await pool.connect();
    // Dedicated test database only; a private schema avoids touching any existing tables.
    await client.query("CREATE SCHEMA gms_group_test; SET search_path TO gms_group_test");
    for (const name of ["001_user_tidal_connections.sql", "029_recommendation_batches.sql", "030_recommendation_history_hidden_tracks.sql", "034_recommendation_history_hidden_batches.sql"]) await client.query(await migration(name));
    await client.query("CREATE TABLE user_recommendation_decisions (id uuid DEFAULT gen_random_uuid(), user_id uuid, source_track_id uuid, decision text, created_at timestamptz DEFAULT now())");
    await client.query("INSERT INTO app_users(id,auth0_subject) VALUES ($1,'auth0|group-fixture'),(gen_random_uuid(),'auth0|other')",[userId]);
    for (const [id, track, status] of [[batchId,trackId,"current"],[pastId,pastTrackId,"replaced"],[emptyId,null,"exhausted"]] as const) {
      // Exhausted belongs to another user to respect the one-active-batch invariant.
      await client.query(`INSERT INTO user_recommendation_batches(id,user_id,status,profile_version,ranking_version,recommendations,track_ids,replaced_at)
        VALUES($1, CASE WHEN $3='exhausted' THEN (SELECT id FROM app_users WHERE auth0_subject='auth0|other') ELSE $2::uuid END,$3,'ems-v1','baseline',$4,$5,CASE WHEN $3='replaced' THEN now() ELSE NULL END)`,
        [id,userId,status,JSON.stringify(track?snapshot(track):{...snapshot(trackId),tracks:[]}),track?[track]:[]]);
      if (track) await client.query("INSERT INTO user_recommendation_exposures(user_id,track_id,batch_id,position,ranking_version) VALUES($1,$2,$3,1,'baseline')",[userId,track,id]);
    }
    await client.query("INSERT INTO user_recommendation_decisions(user_id,source_track_id,decision) VALUES($1,$2,'accept')",[userId,pastTrackId]);
    database = client as unknown as TransactionExecutor;
  });
  afterAll(async () => {
    if (client) { await client.query("DROP SCHEMA gms_group_test CASCADE"); client.release(); }
    await pool?.end();
  });
  it("persists single-track removal across reload without changing the active batch", async () => {
    expect(await hidePersonalizedRecommendationHistoryTrack("auth0|other",batchId,trackId,database)).toBe(false);
    expect(await hidePersonalizedRecommendationHistoryTrack("auth0|group-fixture",batchId,trackId,database)).toBe(true);
    const current = await getOrCreatePersonalizedRecommendationBatch("auth0|group-fixture",12,database);
    expect(current.batchId).toBe(batchId); expect(current.newlyCreated).toBe(false); expect(current.recommendations.tracks).toEqual([]);
    expect((await getAllPersonalizedRecommendationHistory("auth0|group-fixture",database)).find(item=>item.batchId===batchId)?.tracks).toEqual([]);
  });
  it("atomically hides owned groups, remains idempotent and preserves snapshots, exposures and decisions", async () => {
    const before = await client.query("SELECT (SELECT jsonb_agg(to_jsonb(b)) FROM user_recommendation_batches b) AS batches, (SELECT count(*) FROM user_recommendation_exposures) AS exposures, (SELECT count(*) FROM user_recommendation_decisions) AS decisions");
    expect(await hidePersonalizedRecommendationHistoryBatch("auth0|other",pastId,database)).toBe(false);
    expect(await hidePersonalizedRecommendationHistoryBatch("auth0|group-fixture",pastId,database)).toBe(true);
    expect(await hidePersonalizedRecommendationHistoryBatch("auth0|group-fixture",pastId,database)).toBe(true);
    expect((await getAllPersonalizedRecommendationHistory("auth0|group-fixture",database)).map(item=>item.batchId)).toEqual([batchId]);
    expect((await getAllPersonalizedRecommendationHistory("auth0|other",database)).map(item=>item.batchId)).toEqual([emptyId]);
    const after = await client.query("SELECT (SELECT jsonb_agg(to_jsonb(b)) FROM user_recommendation_batches b) AS batches, (SELECT count(*) FROM user_recommendation_exposures) AS exposures, (SELECT count(*) FROM user_recommendation_decisions) AS decisions");
    expect(after.rows).toEqual(before.rows);
    expect(await hidePersonalizedRecommendationHistoryBatch("auth0|group-fixture",batchId,database)).toBe(true);
    expect((await getOrCreatePersonalizedRecommendationBatch("auth0|group-fixture",12,database)).batchId).toBe(batchId);
    expect(await getAllPersonalizedRecommendationHistory("auth0|group-fixture",database)).toEqual([]);
  });
  it("hides empty groups and supports migration down/reapply without losing original evidence", async () => {
    expect(await hidePersonalizedRecommendationHistoryBatch("auth0|other",emptyId,database)).toBe(true);
    expect(await getAllPersonalizedRecommendationHistory("auth0|other",database)).toEqual([]);
    await client.query(await migration("034_recommendation_history_hidden_batches.down.sql"));
    expect((await client.query("SELECT count(*) FROM user_recommendation_batches")).rows[0].count).toBe("3");
    expect((await client.query("SELECT count(*) FROM user_recommendation_history_hidden_tracks")).rows[0].count).toBe("2");
    await client.query(await migration("034_recommendation_history_hidden_batches.sql"));
    expect((await client.query("SELECT count(*) FROM user_recommendation_history_hidden_batches")).rows[0].count).toBe("0");
  });
});
