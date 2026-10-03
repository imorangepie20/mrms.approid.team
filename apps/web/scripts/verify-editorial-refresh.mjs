// 격리 editorial_refresh_check DB에서만 실제 관리자 apply 함수를 검증한다.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { applyEditorialRefresh, createEditorialRefresh, EDITORIAL_SLUGS, EDITORIAL_SNAPSHOT_SQL } from "../src/lib/ems/editorial-refresh.ts";
const require = createRequire(process.env.EDITORIAL_CHECK_NODE_ROOT ? `${process.env.EDITORIAL_CHECK_NODE_ROOT}/package.json` : new URL("../package.json", import.meta.url));
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  assert.equal((await pool.query("SELECT current_database() AS db")).rows[0].db, "editorial_refresh_check");
  const snapshot = async () => (await pool.query(EDITORIAL_SNAPSHOT_SQL, [EDITORIAL_SLUGS])).rows[0].snapshot;
  const screensBefore = (await pool.query("SELECT * FROM ems_screen_sections ORDER BY screen,section_id")).rows;
  const userBefore = (await pool.query("SELECT id,auth0_subject,created_at FROM app_users ORDER BY id")).rows;
  const original = await snapshot();
  const job = (await pool.query("SELECT * FROM ems_editorial_refresh_jobs WHERE status='ready'")).rows[0];
  const readyFixture = async () => {
    await pool.query("UPDATE ems_editorial_refresh_jobs SET status='expired' WHERE status IN ('ready','running','pending')");
    return (await pool.query("INSERT INTO ems_editorial_refresh_jobs(status,preview,backup,created_by,expires_at) VALUES ('ready',$1::jsonb,$2::jsonb,'fixture',now()+interval '30 minutes') RETURNING id", [JSON.stringify(job.preview), JSON.stringify(await snapshot())])).rows[0].id;
  };
  const reject = async (id, code) => {
    const before = await snapshot();
    await assert.rejects(applyEditorialRefresh(pool, id, "fixture-admin"), (error) => error.code === code);
    assert.deepEqual(await snapshot(), before, `${code} changed membership`);
  };
  await reject("bad-id", "invalid_editorial_refresh_id");
  await reject("12345678-1234-1234-1234-123456789abc", "editorial_refresh_not_found");
  let id = await readyFixture();
  await pool.query("UPDATE ems_editorial_refresh_jobs SET expires_at=now()-interval '1 minute' WHERE id=$1", [id]);
  await reject(id, "editorial_refresh_not_ready");
  id = await readyFixture();
  await pool.query("UPDATE ems_editorial_refresh_jobs SET preview=jsonb_set(preview,'{canApply}','false') WHERE id=$1", [id]);
  await reject(id, "editorial_refresh_invalid_preview");
  id = await readyFixture();
  await pool.query("UPDATE ems_track_sections SET source_playlist_name='changed' WHERE section_id=$1", [job.preview.sections[0].id]);
  await reject(id, "editorial_refresh_stale");
  id = await readyFixture();
  const unavailable = job.preview.sections[0].tracks[0].id;
  await pool.query("INSERT INTO ems_availability_events(track_id,region,capability,playable,observed_at) VALUES ($1,'KR','STREAM',false,now()+interval '1 second')", [unavailable]);
  await reject(id, "editorial_refresh_track_unavailable");
  await pool.query("INSERT INTO ems_availability_events(track_id,region,capability,playable,observed_at) VALUES ($1,'KR','STREAM',true,now()+interval '2 seconds')", [unavailable]);
  id = await readyFixture();
  // 두 번째 section INSERT에서 실제 DB 예외를 발생시켜 앞 section 교체도 rollback되는지 확인한다.
  await pool.query(`CREATE FUNCTION editorial_fixture_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_playlist_id='new-seasonal-jazz' THEN RAISE EXCEPTION 'injected fixture failure'; END IF; RETURN NEW; END $$`);
  await pool.query("CREATE TRIGGER editorial_fixture_failure BEFORE INSERT ON ems_track_sections FOR EACH ROW EXECUTE FUNCTION editorial_fixture_failure()");
  const beforeFailure = await snapshot();
  await assert.rejects(applyEditorialRefresh(pool, id, "fixture-admin"));
  assert.deepEqual(await snapshot(), beforeFailure);
  assert.equal((await pool.query("SELECT status FROM ems_editorial_refresh_jobs WHERE id=$1", [id])).rows[0].status, "ready");
  await pool.query("DROP TRIGGER editorial_fixture_failure ON ems_track_sections; DROP FUNCTION editorial_fixture_failure()");
  const concurrent = await Promise.allSettled([applyEditorialRefresh(pool, id, "fixture-admin"), applyEditorialRefresh(pool, id, "fixture-admin")]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.find((result) => result.status === "rejected").reason.code, "editorial_refresh_not_ready");
  const actual = await snapshot();
  for (const section of job.preview.sections) {
    const ids = actual.memberships.filter((m) => m.section_id === section.id).map((m) => m.track_id);
    assert.deepEqual(ids, section.tracks.map((t) => t.id));
  }
  assert.equal(actual.memberships.length, 60);
  assert.equal(new Set(actual.memberships.map((m) => m.track_id)).size, 60);
  assert.deepEqual((await pool.query("SELECT * FROM ems_screen_sections ORDER BY screen,section_id")).rows, screensBefore);
  assert.deepEqual((await pool.query("SELECT id,auth0_subject,created_at FROM app_users ORDER BY id")).rows, userBefore);
  assert.deepEqual(actual.sections.map(({ updated_at, ...s }) => s), original.sections.map(({ updated_at, ...s }) => s));
  await reject(id, "editorial_refresh_not_ready");
  const duplicate = await Promise.allSettled([createEditorialRefresh(pool, "fixture-admin"), createEditorialRefresh(pool, "fixture-admin")]);
  assert.equal(duplicate.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(duplicate.find((r) => r.status === "rejected").reason.code, "editorial_refresh_already_open");
  console.log(JSON.stringify({ checks: 11, invalidId: true, missingId: true, expiry: true, insufficient: true, stale: true, latestAvailability: true, rollback: true, concurrentApply: true, exactPreview: true, settingsAndUserPreserved: true, concurrentPreview: true }));
} finally { await pool.end(); }
