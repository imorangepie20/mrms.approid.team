import type { LikeItem, LikeKey, LikeSnapshot } from "@/lib/likes/types";

import { getDatabasePool } from "./pool";
import type { QueryExecutor } from "./user-connections";

type LikeRow = {
  artwork_url: string | null;
  created_at: Date | string;
  entity_type: LikeItem["entityType"];
  metadata: LikeItem["metadata"];
  source: LikeItem["source"];
  source_id: string;
  subtitle: string;
  title: string;
};

function database(executor?: QueryExecutor) {
  return executor ?? (getDatabasePool() as QueryExecutor);
}

function toLikeItem(row: LikeRow): LikeItem {
  return {
    artworkUrl: row.artwork_url ?? "",
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
    entityType: row.entity_type,
    metadata: row.metadata,
    source: row.source,
    sourceId: row.source_id,
    subtitle: row.subtitle,
    title: row.title,
  };
}

export async function getUserLikes(
  auth0Subject: string,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<LikeRow>(
    `SELECT
       l.entity_type,
       l.source,
       l.source_id,
       l.title,
       l.subtitle,
       l.artwork_url,
       l.metadata,
       l.created_at
     FROM user_likes AS l
     INNER JOIN app_users AS u ON u.id = l.user_id
     WHERE u.auth0_subject = $1
     ORDER BY l.created_at DESC, l.id DESC`,
    [auth0Subject],
  );
  return result.rows.map(toLikeItem);
}

export async function upsertUserLike(
  auth0Subject: string,
  item: LikeKey & LikeSnapshot,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<LikeRow>(
    `INSERT INTO user_likes (
       user_id, entity_type, source, source_id, title, subtitle, artwork_url, metadata
     )
     SELECT u.id, $2, $3, $4, $5, $6, NULLIF($7, ''), $8::jsonb
     FROM app_users AS u
     WHERE u.auth0_subject = $1
     ON CONFLICT (user_id, entity_type, source, source_id)
     DO UPDATE SET
       title = EXCLUDED.title,
       subtitle = EXCLUDED.subtitle,
       artwork_url = EXCLUDED.artwork_url,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING entity_type, source, source_id, title, subtitle, artwork_url, metadata, created_at`,
    [
      auth0Subject,
      item.entityType,
      item.source,
      item.sourceId,
      item.title,
      item.subtitle,
      item.artworkUrl,
      JSON.stringify(item.metadata),
    ],
  );
  const saved = result.rows[0];
  if (!saved) throw new Error("like_user_not_found");
  return toLikeItem(saved);
}

export async function deleteUserLike(
  auth0Subject: string,
  key: LikeKey,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<{ id: string }>(
    `DELETE FROM user_likes AS l
     USING app_users AS u
     WHERE l.user_id = u.id
       AND u.auth0_subject = $1
       AND l.entity_type = $2
       AND l.source = $3
       AND l.source_id = $4
     RETURNING l.id`,
    [auth0Subject, key.entityType, key.source, key.sourceId],
  );
  return result.rows.length > 0;
}
