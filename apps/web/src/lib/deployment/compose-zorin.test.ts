import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Service = {
  build?: { context?: string; dockerfile?: string };
  cpus?: number;
  depends_on?: Record<string, unknown>;
  environment?: Record<string, string>;
  healthcheck?: Record<string, unknown>;
  image?: string;
  mem_limit?: string;
  networks?: string[];
  ports?: string[];
  restart?: string;
};

const composePath = resolve(process.cwd(), "../../infra/compose.zorin.yml");
const compose = parse(readFileSync(composePath, "utf8")) as {
  services: Record<string, Service>;
};

describe("Zorin Compose", () => {
  it("keeps the embedding model private and health checked", () => {
    const embedding = compose.services.embedding;

    expect(embedding.ports).toBeUndefined();
    expect(embedding.networks).toEqual(["backend"]);
    expect(embedding.healthcheck).toBeDefined();
    expect(embedding.restart).toBe("unless-stopped");
    expect(embedding.mem_limit).toBe("3g");
    expect(embedding.cpus).toBe(4);
  });

  it("uses the digest-pinned pgvector PostgreSQL 16 image", () => {
    expect(compose.services.postgres.image).toContain(
      "pgvector/pgvector:0.8.6-pg16-bookworm@sha256:",
    );
  });

  it("connects Web to embedding without making model health a startup dependency", () => {
    const web = compose.services.web;

    expect(web.environment).toMatchObject({
      EMBEDDING_SERVICE_URL: "http://embedding:8000",
    });
    expect(web.depends_on).not.toHaveProperty("embedding");
  });
});
