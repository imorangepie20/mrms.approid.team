import { AdminAuthError } from "@/lib/auth/admin";

export function adminErrorResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    return Response.json({ code: error.code }, { status: error.status });
  }
  if (error && typeof error === "object" && "status" in error && "code" in error) {
    const candidate = error as { status?: unknown; code?: unknown };
    if ((candidate.status === 401 || candidate.status === 403) && typeof candidate.code === "string") {
      return Response.json({ code: candidate.code }, { status: candidate.status });
    }
  }
  if (error instanceof Error && error.message.startsWith("invalid_")) {
    return Response.json({ code: error.message }, { status: 400 });
  }
  if (error instanceof Error && error.message === "ems_section_not_found") {
    return Response.json({ code: error.message }, { status: 404 });
  }
  return Response.json({ code: "admin_ems_unavailable" }, { status: 503 });
}
