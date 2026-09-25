import { randomUUID } from "node:crypto";

export type HomeContentKind = "hero" | "concept" | "guide" | "story";
export type HomeContent = {
  id: string;
  kind: HomeContentKind;
  title: string;
  body: string;
  linkLabel: string;
  linkHref: string;
  sortOrder: number;
  active: boolean;
  updatedAt: string;
};

export type HomeContentInput = Pick<HomeContent, "title" | "body" | "linkLabel" | "linkHref" | "sortOrder" | "active">;

type QueryExecutor = {
  query<Row extends Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: Row[] }>;
};

type Row = {
  id: string; kind: HomeContentKind; title: string; body: string;
  link_label: string; link_href: string; sort_order: number; active: boolean; updated_at: string;
};

function mapRow(row: Row): HomeContent {
  return { id: row.id, kind: row.kind, title: row.title, body: row.body, linkLabel: row.link_label, linkHref: row.link_href, sortOrder: row.sort_order, active: row.active, updatedAt: row.updated_at };
}

const fields = "id, kind, title, body, link_label, link_href, sort_order, active, updated_at";

export async function listHomeContent(executor: QueryExecutor, includeInactive = false) {
  const result = await executor.query<Row>(`SELECT ${fields} FROM home_content ${includeInactive ? "" : "WHERE active = true"} ORDER BY CASE kind WHEN 'hero' THEN 0 WHEN 'concept' THEN 1 WHEN 'guide' THEN 2 ELSE 3 END, sort_order, id`);
  return result.rows.map(mapRow);
}

export function parseHomeContentInput(value: unknown): HomeContentInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_home_content");
  const input = value as Record<string, unknown>;
  const allowed = ["title", "body", "linkLabel", "linkHref", "sortOrder", "active"];
  if (Object.keys(input).some((key) => !allowed.includes(key)) ||
    typeof input.title !== "string" || !input.title.trim() || input.title.length > 160 ||
    typeof input.body !== "string" || !input.body.trim() || input.body.length > 1000 ||
    typeof input.linkLabel !== "string" || input.linkLabel.length > 80 ||
    typeof input.linkHref !== "string" || (input.linkHref !== "" && !/^\/(?:[a-z0-9-]+\/?)*$/.test(input.linkHref)) ||
    Boolean(input.linkLabel.trim()) !== Boolean(input.linkHref) ||
    typeof input.sortOrder !== "number" || !Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 9999 ||
    typeof input.active !== "boolean") throw new Error("invalid_home_content");
  return { title: input.title.trim(), body: input.body.trim(), linkLabel: input.linkLabel.trim(), linkHref: input.linkHref, sortOrder: input.sortOrder, active: input.active };
}

export async function updateHomeContent(id: string, input: HomeContentInput, executor: QueryExecutor) {
  const result = await executor.query<Row>(`UPDATE home_content SET title=$2, body=$3, link_label=$4, link_href=$5, sort_order=$6, active=$7, updated_at=now() WHERE id=$1 RETURNING ${fields}`,
    [id, input.title, input.body, input.linkLabel, input.linkHref, input.sortOrder, input.active]);
  if (!result.rows[0]) throw new Error("home_content_not_found");
  return mapRow(result.rows[0]);
}

export async function createHomeStory(input: HomeContentInput, executor: QueryExecutor) {
  const result = await executor.query<Row>(`INSERT INTO home_content (id, kind, title, body, link_label, link_href, sort_order, active) VALUES ($1, 'story', $2, $3, $4, $5, $6, $7) RETURNING ${fields}`,
    [`story-${randomUUID()}`, input.title, input.body, input.linkLabel, input.linkHref, input.sortOrder, input.active]);
  return mapRow(result.rows[0]);
}

export async function deleteHomeStory(id: string, executor: QueryExecutor) {
  const result = await executor.query<{ id: string }>("DELETE FROM home_content WHERE id=$1 AND kind='story' RETURNING id", [id]);
  if (!result.rows[0]) throw new Error("home_content_not_found");
}
