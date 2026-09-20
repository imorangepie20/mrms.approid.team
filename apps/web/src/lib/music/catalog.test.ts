import { describe, expect, it } from "vitest";

import { catalog } from "./fixtures";
import { filterCatalogTracks } from "./catalog";

describe("filterCatalogTracks", () => {
  it("filters the public catalog by a case-insensitive keyword", () => {
    expect(filterCatalogTracks(catalog, { query: "m83" }).map((track) => track.id)).toEqual(["t-1"]);
  });
});
