import { expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({redirect:vi.fn(() => {throw new Error("NEXT_REDIRECT");})}));
vi.mock("next/navigation", () => navigation);
import HistoryPage from "./page";
it("redirects the old archive route to the unified GMS page", () => {
  expect(() => HistoryPage()).toThrow("NEXT_REDIRECT");
  expect(navigation.redirect).toHaveBeenCalledWith("/gms");
});
