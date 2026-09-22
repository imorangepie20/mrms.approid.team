BEGIN;

DROP TABLE IF EXISTS user_taste_centroids;
DROP TABLE IF EXISTS user_taste_profiles;
DROP TABLE IF EXISTS track_embeddings;
DROP EXTENSION IF EXISTS vector;

COMMIT;
