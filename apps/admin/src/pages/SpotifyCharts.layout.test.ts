import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, "SpotifyCharts.tsx"), "utf8");
const layout = readFileSync(join(root, "../layouts/MainLayout.tsx"), "utf8");

describe("Spotify chart admin layout", () => {
  it("keeps four-column content above the sidebar-safe breakpoint", () => {
    expect(page.match(/2xl:grid-cols-4/g)).toHaveLength(2);
    expect(page).not.toMatch(/(?:^|\s)xl:grid-cols-4/);
  });

  it("allows the page, run id, and statistics to shrink without page overflow", () => {
    expect(layout).toContain('className={`min-w-0 transition-all');
    expect(page).toContain('className="min-w-0 space-y-6"');
    expect(page).toContain("break-all font-mono");
    expect(page).toContain("min-w-0 break-words text-right");
  });
});
