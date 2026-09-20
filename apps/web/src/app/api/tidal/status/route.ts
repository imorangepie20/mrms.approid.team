import { NextResponse } from "next/server";

import { requireAuth0Subject } from "@/lib/auth/auth0";
import { getUserConnection } from "@/lib/db/user-connections";

export async function GET() {
  try {
    const auth0Subject = await requireAuth0Subject();
    const connection = await getUserConnection(auth0Subject);
    return NextResponse.json({ status: connection?.status ?? "not_connected" });
  } catch {
    return NextResponse.json({ status: "not_connected" }, { status: 401 });
  }
}
