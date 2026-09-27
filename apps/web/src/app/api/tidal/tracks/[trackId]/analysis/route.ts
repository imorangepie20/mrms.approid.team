import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUsableTidalAccessToken } from "@/lib/db/user-connections";
import {
  resolveTidalPlaybackStream,
  TidalPlaybackStreamError,
} from "@/lib/tidal/playback-stream";

type Context = { params: Promise<{ trackId: string }> };

export const MAX_ANALYSIS_AUDIO_BYTES = 48 * 1024 * 1024;

function limitedStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let received = 0;
  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      await reader.cancel(reason);
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      received += value.byteLength;
      if (received > MAX_ANALYSIS_AUDIO_BYTES) {
        await reader.cancel("analysis_audio_limit_exceeded");
        controller.error(new Error("analysis_audio_limit_exceeded"));
        return;
      }
      controller.enqueue(value);
    },
  });
}

export async function GET(request: Request, context: Context) {
  let subject: string;
  try {
    subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const [{ trackId }, token] = await Promise.all([
      context.params,
      getUsableTidalAccessToken(subject),
    ]);
    const quality = new URL(request.url).searchParams.get("quality") ?? "HIGH";
    const stream = await resolveTidalPlaybackStream(trackId, token, { quality });
    const upstream = await fetch(stream.streamUrl, {
      cache: "no-store",
      headers: { accept: "audio/*,application/octet-stream;q=0.8" },
      signal: request.signal,
    });
    if (!upstream.ok || !upstream.body) {
      return Response.json({ code: "tidal_analysis_audio_unavailable" }, { status: 502 });
    }

    const declaredLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ANALYSIS_AUDIO_BYTES) {
      await upstream.body.cancel();
      return Response.json({ code: "tidal_analysis_audio_too_large" }, { status: 413 });
    }

    return new Response(limitedStream(upstream.body), {
      headers: {
        "cache-control": "private, no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof TidalPlaybackStreamError) {
      return Response.json({ code: error.code }, { status: 409 });
    }
    return Response.json({ code: "tidal_analysis_audio_unavailable" }, { status: 502 });
  }
}
