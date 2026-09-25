BEGIN;

ALTER TABLE ems_melon_jobs
  ADD COLUMN batch_discovered_count INTEGER NOT NULL DEFAULT 0
    CHECK (batch_discovered_count BETWEEN 0 AND 100),
  ADD COLUMN next_batch_at TIMESTAMPTZ;

-- Existing jobs may have a backlog from the prior continuous crawler.
-- Drain it before fetching another page under the new 100-song rule.
UPDATE ems_melon_jobs
   SET batch_discovered_count = 100
 WHERE status IN ('pending', 'running', 'paused') AND discovered_count > 0;

COMMIT;
