import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for token in cookies (set after login) or skip if no auth needed.
  // We use a cookie because middleware runs on the server and can't access localStorage.
  const token = request.cookies.get("recif_token")?.value;

  // If no token cookie, check if AUTH_ENABLED is false (dev mode — always allow).
  // AUTH_ENABLED is a server-side env var; we expose it via NEXT_PUBLIC_AUTH_ENABLED.
  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

  if (authEnabled && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static assets)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
