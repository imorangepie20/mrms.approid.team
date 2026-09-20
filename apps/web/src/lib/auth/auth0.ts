import { Auth0Client } from "@auth0/nextjs-auth0/server";

export const auth0 = new Auth0Client({
  appBaseUrl: process.env.APP_BASE_URL,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
  domain: process.env.AUTH0_DOMAIN,
  enableAccessTokenEndpoint: false,
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
