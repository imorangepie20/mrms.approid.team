import { adminErrorResponse } from "@/lib/api/admin-response";
import { requireAdminAuth0Subject } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db/pool";
import {
  createSpotifyChartRun,
  listSpotifyChartRuns,
  SPOTIFY_CHART_TARGETS,
} from "@/lib/ems/spotify-charts";

function originAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(process.env.APP_BASE_URL || request.url).origin;
}

export async function GET() {
  try {
    await requireAdminAuth0Subject();
    return Response.json({
      targets: SPOTIFY_CHART_TARGETS,
      limits: { playlists: 4, tracksPerPlaylist: 50, spotifyRequests: 4, tidalRequests: 450 },
      runs: await listSpotifyChartRuns(getDatabasePool()),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminAuth0Subject();
    if (!originAllowed(request)) {
      return Response.json({ code: "invalid_admin_origin" }, { status: 403 });
    }
    const id = await createSpotifyChartRun(getDatabasePool(), actor);
    return Response.json({ id, status: "pending" }, { status: 201 });
  } catch (error) {
    if (
      (error instanceof Error && error.message === "spotify_chart_run_already_open") ||
      (error && typeof error === "object" && "code" in error && error.code === "23505")
    ) {
      return Response.json({ code: "spotify_chart_run_already_open" }, { status: 409 });
    }
    return adminErrorResponse(error);
  }
}
