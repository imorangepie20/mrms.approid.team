export function GET() {
  return new Response(null, {
    headers: { location: "/api/auth/login?screen_hint=signup" },
    status: 307,
  });
}
