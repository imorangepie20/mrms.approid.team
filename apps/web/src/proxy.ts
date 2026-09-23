import { NextRequest, NextResponse } from "next/server";

import { auth0 } from "@/lib/auth/auth0";

export default async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/admin/")) {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname.startsWith("/admin")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-music-pie-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  return auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
