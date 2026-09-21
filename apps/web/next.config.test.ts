import { expect, it } from "vitest";

import config from "./next.config";

it("builds a standalone production server", () => {
  expect(config.output).toBe("standalone");
});
