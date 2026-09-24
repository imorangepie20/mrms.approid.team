import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";

export const auth0 = new Auth0Client({
  appBaseUrl: process.env.APP_BASE_URL,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  domain: process.env.AUTH0_DOMAIN,
  enableAccessTokenEndpoint: false,
  onCallback: async (error, context) => {
    if (error) return new NextResponse(error.message, { status: 500 });
    if (!context.appBaseUrl) return new NextResponse("Auth0 callback base URL is missing.", { status: 500 });

    const appBaseUrl = new URL(context.appBaseUrl);
    const requestedUrl = new URL(context.returnTo ?? "/", appBaseUrl);
    const returnUrl = requestedUrl.origin === appBaseUrl.origin
      ? requestedUrl
      : new URL("/", appBaseUrl);
    const isAdminReturn = returnUrl.pathname === "/admin" || returnUrl.pathname.startsWith("/admin/");
    if (context.responseType !== "code" || context.challengeMode === "popup" || isAdminReturn) {
      return NextResponse.redirect(returnUrl);
    }

    const connectionUrl = new URL("/tidal-connection", appBaseUrl);
    connectionUrl.searchParams.set("returnTo", `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`);
    return NextResponse.redirect(connectionUrl);
  },
  routes: {
    callback: "/api/auth/callback",
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    profile: "/api/auth/profile",
  },
  secret: process.env.AUTH0_SECRET,
});

type Auth0SessionReader = () => Promise<{
  user: { sub?: string | null };
} | null>;

export async function requireAuth0Subject(
  readSession: Auth0SessionReader = () => auth0.getSession(),
) {
  const session = await readSession();
  const subject = session?.user.sub;

  if (!subject) {
    throw new Error("Authentication required.");
  }

  return subject;
}
