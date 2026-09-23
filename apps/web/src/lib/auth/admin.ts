import { requireAuth0Subject } from "./auth0";

export type AdminAuthCode = "unauthorized" | "admin_forbidden";

export class AdminAuthError extends Error {
  readonly status: 401 | 403;
  readonly code: AdminAuthCode;

  constructor(status: 401 | 403, code: AdminAuthCode) {
    super(code);
    this.name = "AdminAuthError";
    this.status = status;
    this.code = code;
  }
}

export function parseAdminAuth0Subjects(value = process.env.ADMIN_AUTH0_SUBJECTS ?? "") {
  return [...new Set(value.split(/[\s,]+/).map((subject) => subject.trim()).filter(Boolean))];
}

type SessionReader = Parameters<typeof requireAuth0Subject>[0];

export async function requireAdminAuth0Subject(readSession?: SessionReader) {
  let subject: string;
  try {
    subject = await requireAuth0Subject(readSession);
  } catch (error) {
    if (error instanceof Error && error.message === "Authentication required.") {
      throw new AdminAuthError(401, "unauthorized");
    }
    throw error;
  }

  if (!parseAdminAuth0Subjects().includes(subject)) {
    throw new AdminAuthError(403, "admin_forbidden");
  }

  return subject;
}
