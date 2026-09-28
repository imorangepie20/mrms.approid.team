import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(join(root, "AudioAnalysis.tsx"), "utf8");
const app = readFileSync(join(root, "../App.tsx"), "utf8");
const sidebar = readFileSync(join(root, "../components/layout/Sidebar.tsx"), "utf8");

describe("audio analysis admin page", () => {
  it("connects the live observation page to routing and navigation", () => {
    expect(app).toContain('path="audio-analysis"');
    expect(app).toContain("<AudioAnalysis />");
    expect(sidebar).toContain("오디오 분석 관측");
    expect(sidebar).toContain("path: '/audio-analysis'");
  });

  it("shows coverage, versions, errors, safe details, and one-track reprocessing", () => {
    expect(page).toContain("전체 coverage");
    expect(page).toContain("Feature version");
    expect(page).toContain("Embedding model version");
    expect(page).toContain("Prediction model version");
    expect(page).toContain("Retry · terminal error");
    expect(page).toContain("Preview SHA-256");
    expect(page).toContain("DSP feature");
    expect(page).toContain("Prediction");
    expect(page).toContain("dimensions");
    expect(page).toContain("window.confirm");
    expect(page).toContain("requeueAudioAnalysisTrack(detail.id, FEATURE_VERSION)");
    expect(page).toContain('aria-label="오디오 분석 새로고침"');
    expect(page).toContain('aria-label="트랙 상세 닫기"');
  });
});
