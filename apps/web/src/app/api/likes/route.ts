import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUserLikes } from "@/lib/db/user-likes";
import {
  likeEntityTypes,
  type LikeEntityType,
  type LikeItem,
  type LikesResponse,
} from "@/lib/likes/types";

function groupLikes(items: LikeItem[]): LikesResponse {
  const albums = items.filter((item) => item.entityType === "album");
  const artists = items.filter((item) => item.entityType === "artist");
  const playlists = items.filter((item) => item.entityType === "playlist");
  const tracks = items.filter((item) => item.entityType === "track");
  return {
    albums,
    artists,
    counts: {
      album: albums.length,
      artist: artists.length,
      playlist: playlists.length,
      track: tracks.length,
    },
    playlists,
    tracks,
  };
}

export async function GET(request: Request) {
  const requestedType = new URL(request.url).searchParams.get("type");
  if (requestedType && !likeEntityTypes.includes(requestedType as LikeEntityType)) {
    return Response.json({ code: "invalid_like_type" }, { status: 400 });
  }

  let auth0Subject: string;
  try {
    auth0Subject = await requireAuth0Subject();
  } catch {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }

  try {
    const likes = await getUserLikes(auth0Subject);
    const filtered = requestedType
      ? likes.filter((item) => item.entityType === requestedType)
      : likes;
    return Response.json(groupLikes(filtered));
  } catch {
    return Response.json({ code: "likes_read_failed" }, { status: 500 });
  }
}
