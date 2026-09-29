BEGIN;

CREATE TABLE ems_catalog_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tidal_id TEXT,
  isrc TEXT,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tidal_id IS NOT NULL OR isrc IS NOT NULL)
);

CREATE UNIQUE INDEX ems_catalog_exclusions_tidal_id_uq
  ON ems_catalog_exclusions (tidal_id)
  WHERE tidal_id IS NOT NULL;

CREATE UNIQUE INDEX ems_catalog_exclusions_isrc_uq
  ON ems_catalog_exclusions (isrc)
  WHERE isrc IS NOT NULL;

COMMIT;
