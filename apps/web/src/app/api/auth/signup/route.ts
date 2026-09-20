import { NextResponse } from "next/server";

export function GET(request: Request) {
  return NextResponse.redirect(new URL("/api/auth/login?screen_hint=signup", request.url));
}
