import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn(() => {
  throw new Error("NEXT_REDIRECT");
}));

vi.mock("next/navigation", () => ({ redirect }));

import VisualizerPage from "./page";

describe("VisualizerPage", () => {
  it("redirects the retired standalone visualizer to Home", () => {
    expect(() => VisualizerPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
