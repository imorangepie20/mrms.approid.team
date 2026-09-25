BEGIN;

ALTER TABLE ems_melon_jobs
  DROP COLUMN next_batch_at,
  DROP COLUMN batch_discovered_count;

COMMIT;
