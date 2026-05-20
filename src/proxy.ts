import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that bypass auth. Heavy analysis endpoints are intentionally excluded:
// they consume provider quota and must run under an authenticated session.
const PUBLIC_ROUTES = [
  "/auth/signin",
  "/auth/register",
  "/auth/forgot",
  "/auth/reset",
  "/auth/error",
  "/api/auth",
  "/api/countries",
  "/api/leagues",
  "/api/fixtures",
  "/api/match",
  "/api/live",
  "/api/openapi",
  "/api/health",
  "/api/cron",
];

const HEADERS_TO_STRIP = ["x-user-id", "x-user-email", "x-user-role"];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip identity headers from incoming requests so they cannot be spoofed
  const requestHeaders = new Headers(request.headers);
  for (const h of HEADERS_TO_STRIP) requestHeaders.delete(h);

  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  if (isPublicRoute) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Edge-safe: getToken only verifies the JWT, no DB access
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Not authenticated" } },
        { status: 401 }
      );
    }
    const signInUrl = new URL("/auth/signin", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }

  requestHeaders.set("x-user-id", String(token.id ?? token.sub ?? ""));
  if (token.email) requestHeaders.set("x-user-email", String(token.email));
  if (token.role) requestHeaders.set("x-user-role", String(token.role));

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/analysis/:path*",
    "/predictions/:path*",
    "/api/:path*",
  ],
};
