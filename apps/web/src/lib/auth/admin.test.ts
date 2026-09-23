import { afterEach, describe, expect, it } from "vitest";

import { parseAdminAuth0Subjects, requireAdminAuth0Subject } from "./admin";

const originalAllowlist = process.env.ADMIN_AUTH0_SUBJECTS;

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.ADMIN_AUTH0_SUBJECTS;
  else process.env.ADMIN_AUTH0_SUBJECTS = originalAllowlist;
});

describe("parseAdminAuth0Subjects", () => {
  it("splits comma and whitespace separated subjects and removes duplicates", () => {
    expect(parseAdminAuth0Subjects(" auth0|one,auth0|two\n auth0|one ")).toEqual([
      "auth0|one",
      "auth0|two",
    ]);
  });
});

describe("requireAdminAuth0Subject", () => {
  it("returns the subject when the session subject is allowlisted", async () => {
    process.env.ADMIN_AUTH0_SUBJECTS = "auth0|admin";

    await expect(
      requireAdminAuth0Subject(async () => ({ user: { sub: "auth0|admin" } })),
    ).resolves.toBe("auth0|admin");
  });

  it("throws a 401 error for an anonymous session", async () => {
    await expect(requireAdminAuth0Subject(async () => null)).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    });
  });

  it("throws a 403 error for a signed-in subject outside the allowlist", async () => {
    process.env.ADMIN_AUTH0_SUBJECTS = "auth0|other";

    await expect(
      requireAdminAuth0Subject(async () => ({ user: { sub: "auth0|listener" } })),
    ).rejects.toMatchObject({
      status: 403,
      code: "admin_forbidden",
    });
  });
});
