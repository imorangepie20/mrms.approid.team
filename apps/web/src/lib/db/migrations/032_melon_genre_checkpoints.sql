ALTER TABLE ems_melon_jobs
  ADD COLUMN genre_checkpoints JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Preserve legacy completed genres and the current genre's exact page position.
UPDATE ems_melon_jobs AS job
SET genre_checkpoints = (
  SELECT COALESCE(jsonb_object_agg(genre->>'code', jsonb_build_object(
    'nextStartIndex', CASE WHEN position - 1 = job.genre_index THEN job.next_start_index ELSE 1 END,
    'lastPageFirstSongId', CASE WHEN position - 1 = job.genre_index THEN job.last_page_first_song_id ELSE NULL END,
    'completed', position - 1 < job.genre_index
  )), '{}'::jsonb)
  FROM jsonb_array_elements(job.genre_codes) WITH ORDINALITY AS genres(genre, position)
)
WHERE genre_codes IS NOT NULL;
