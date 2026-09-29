export function GET() {
  return new Response(null, {
    headers: { location: "/api/auth/login?screen_hint=signup&returnTo=%2Fonboarding%3Ftidal%3Dconnected" },
    status: 307,
  });
}
