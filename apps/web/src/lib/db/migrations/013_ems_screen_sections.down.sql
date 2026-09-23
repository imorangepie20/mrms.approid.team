DROP TRIGGER IF EXISTS ems_editorial_section_screen_seed ON ems_editorial_sections;
UPDATE ems_editorial_sections AS s
   SET title = cfg.title, description = cfg.description,
       sort_order = cfg.sort_order, active = cfg.active, updated_at = now()
  FROM ems_screen_sections AS cfg
 WHERE cfg.section_id = s.id AND cfg.screen = 'ems';
DROP FUNCTION IF EXISTS seed_ems_screen_sections();
DROP TABLE IF EXISTS ems_screen_sections;
