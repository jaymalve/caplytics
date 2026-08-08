import { auth } from "./auth";

/**
 * Every page requires a session (§8.6).
 *
 * Guarding centrally rather than per page: spend data is the whole content of this app, and a route
 * added later would otherwise be public by default.
 */
export default auth((request) => {
  if (request.auth !== null) return undefined;
  if (request.nextUrl.pathname.startsWith("/login")) return undefined;

  const login = new URL("/login", request.nextUrl.origin);
  return Response.redirect(login);
});

export const config = {
  // Everything except Next's own assets and the auth endpoints, which must stay reachable to sign in.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
