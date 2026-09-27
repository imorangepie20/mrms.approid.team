import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const layout = readFileSync(join(root, "MainLayout.tsx"), "utf8");
const sidebar = readFileSync(join(root, "../components/layout/Sidebar.tsx"), "utf8");
const header = readFileSync(join(root, "../components/layout/Header.tsx"), "utf8");

describe("admin shell responsive layout", () => {
  it("only lets the sidebar consume page width at the 2xl boundary", () => {
    expect(layout).toContain("(min-width: 1536px)");
    expect(layout).toContain("persistentSidebar ? (effectiveCollapsed ? 'ml-20' : 'ml-64') : 'ml-0'");
    expect(layout).toContain('className="fixed inset-0 z-[45] bg-black/55"');
  });

  it("keeps closed drawers outside layout and keyboard navigation", () => {
    expect(sidebar).toContain("aria-hidden={!open}");
    expect(sidebar).toContain("open ? 'translate-x-0' : '-translate-x-full'");
    expect(sidebar).toContain("{open && <>");
  });

  it("clips page-level overflow while preserving component scroll regions", () => {
    expect(layout).toContain("min-h-screen min-w-0 overflow-x-hidden");
    expect(layout).toContain("min-w-0 max-w-full overflow-x-hidden");
    expect(header).toContain('aria-label="관리자 메뉴 열기"');
  });
});
