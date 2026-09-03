import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * A cheap redirect so signed-out visitors land on /login instead of a flash of empty dashboard.
 *
 * Deliberately **not** the authorization check. It only observes that a session cookie exists, and
 * a cookie's presence proves nothing — middleware-only auth is a known bypass class in Next.js. The
 * real check is `auth()` inside the page, which verifies the session and redirects without it.
 *
 * Keeping next-auth out of this file also keeps its config out of the edge bundle, where
 * `process.env` is a limited proxy and the module fails to load.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function middleware(request: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();

  return NextResponse.redirect(new URL("/login", request.nextUrl.origin));
}

export const config = {
  // Everything except Next's own assets and the auth endpoints, which must stay reachable to sign in.
  matcher: ["/((?!api/auth|login|_next/static|_next/image|favicon.ico).*)"],
};
