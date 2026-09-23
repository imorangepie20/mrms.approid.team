CREATE TABLE ems_screen_sections (
  screen TEXT NOT NULL CHECK (screen IN ('home', 'ems')),
  section_id UUID NOT NULL REFERENCES ems_editorial_sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  active BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (screen, section_id)
);

CREATE INDEX ems_screen_sections_visible_idx
  ON ems_screen_sections (screen, active, sort_order, section_id);

WITH ranked AS (
  SELECT s.*, row_number() OVER (PARTITION BY s.active ORDER BY s.sort_order, s.id) AS active_rank
    FROM ems_editorial_sections AS s
)
INSERT INTO ems_screen_sections (screen, section_id, title, description, sort_order, active, updated_at)
SELECT screen, s.id, s.title, s.description, s.sort_order,
       s.active AND (screen = 'ems' OR s.active_rank <= 3), s.updated_at
  FROM ranked AS s CROSS JOIN (VALUES ('home'), ('ems')) AS screens(screen);

CREATE FUNCTION seed_ems_screen_sections() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ems_screen_sections (screen, section_id, title, description, sort_order, active)
  VALUES
    ('home', NEW.id, NEW.title, NEW.description, NEW.sort_order, false),
    ('ems', NEW.id, NEW.title, NEW.description, NEW.sort_order, NEW.active);
  RETURN NEW;
END;
$$;

CREATE TRIGGER ems_editorial_section_screen_seed
AFTER INSERT ON ems_editorial_sections
FOR EACH ROW EXECUTE FUNCTION seed_ems_screen_sections();
