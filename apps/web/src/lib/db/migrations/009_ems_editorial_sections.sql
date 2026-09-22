BEGIN;

CREATE TABLE ems_editorial_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ems_track_sections (
  section_id UUID NOT NULL REFERENCES ems_editorial_sections(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank >= 0),
  source_playlist_id TEXT NOT NULL,
  source_playlist_name TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, track_id)
);

CREATE INDEX ems_editorial_sections_active_idx
  ON ems_editorial_sections (active, sort_order);
CREATE INDEX ems_track_sections_rank_idx
  ON ems_track_sections (section_id, rank, track_id);

COMMIT;
