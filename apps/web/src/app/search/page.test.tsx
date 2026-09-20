import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/search/tidal-search", () => ({
  TidalSearch: () => <div>TIDAL catalog search</div>,
}));

import SearchPage from "./page";

describe("SearchPage", () => {
  it("renders the TIDAL catalog search experience", () => {
    render(<SearchPage />);

    expect(screen.getByText("TIDAL catalog search")).toBeInTheDocument();
  });
});
