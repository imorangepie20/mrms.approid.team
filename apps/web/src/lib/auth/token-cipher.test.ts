import { describe, expect, it } from "vitest";

import { decryptToken, encryptToken } from "./token-cipher";

const key = Buffer.alloc(32, 7).toString("base64");

describe("token cipher", () => {
  it("round trips a token without exposing plaintext in its stored value", () => {
    const encrypted = encryptToken("tidal-access-token", key);

    expect(encrypted).not.toContain("tidal-access-token");
    expect(decryptToken(encrypted, key)).toBe("tidal-access-token");
  });

  it("rejects a key that is not a 32-byte base64 value", () => {
    expect(() => encryptToken("token", "not-a-valid-key")).toThrow("32-byte base64 key");
  });
});
