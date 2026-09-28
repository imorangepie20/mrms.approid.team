import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, "TasteAnalysis.tsx"), "utf8");
const app = readFileSync(join(root, "../App.tsx"), "utf8");
const sidebar = readFileSync(join(root, "../components/layout/Sidebar.tsx"), "utf8");

describe("taste analysis admin document", () => {
  it("connects the document page to the admin route and sidebar", () => {
    expect(app).toContain('path="taste-analysis"');
    expect(app).toContain('element={<TasteAnalysis />}');
    expect(sidebar).toContain("title: '추천·취향'");
    expect(sidebar).toContain("취향 분석 설계");
    expect(sidebar).toContain("path: '/taste-analysis'");
  });

  it("distinguishes the current model from the proposed audio extension", () => {
    expect(page).toContain("현재 사용자 신호와 가중치");
    expect(page).toContain("프리뷰에서 얻는 분석 지표");
    expect(page).toContain("결합 추천 점수");
    expect(page).toContain("단계별 구현 순서");
    expect(page).toContain("오디오 확장 제안");
  });
});
