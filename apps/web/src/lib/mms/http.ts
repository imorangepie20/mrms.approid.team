const maximumPayloadBytes = 32_768;

export async function readMmsJson(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumPayloadBytes) {
    throw new Error("playlist_payload_too_large");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumPayloadBytes) {
    throw new Error("playlist_payload_too_large");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("invalid_playlist_input");
  }
}

export function mmsErrorResponse(error: unknown, fallbackCode: string) {
  const repositoryCode = error && typeof error === "object" && "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
  const code = repositoryCode ?? (error instanceof Error ? error.message : fallbackCode);
  if (code === "playlist_payload_too_large") {
    return Response.json({ code }, { status: 413 });
  }
  if (code === "playlist_not_found" || code === "playlist_track_not_found") {
    return Response.json({ code }, { status: 404 });
  }
  if (code === "playlist_track_already_exists") {
    return Response.json({ code }, { status: 409 });
  }
  if (code.startsWith("invalid_playlist")) {
    return Response.json({ code }, { status: 400 });
  }
  return Response.json({ code: fallbackCode }, { status: 500 });
}
