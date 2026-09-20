import { expect, it, vi } from "vitest";

import { handleTidalCallback } from "./route";

it("does not persist a connection when callback state is invalid", async () => {
  const persistConnection = vi.fn();
  const exchangeCode = vi.fn();

  const result = await handleTidalCallback(
    {
      auth0Subject: "auth0|listener",
      code: "authorization-code",
      state: "invalid-state",
      storedState: "expected-state",
      verifier: "v".repeat(43),
    },
    { exchangeCode, persistConnection },
  );

  expect(result).toEqual({ ok: false, status: 400 });
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(persistConnection).not.toHaveBeenCalled();
});
