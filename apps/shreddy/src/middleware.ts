import { NextRequest, NextResponse } from "next/server";

/**
 * Sandbox env gate.
 *
 * Sandbox routes (the deep-practice technique mockups under /sandbox and
 * their API at /api/sandbox/*) are only reachable when SHREDDY_SANDBOX=1.
 *
 * No NEXT_PUBLIC_ prefix — this is a server-side decision and must not be
 * inlined into the client bundle.
 *
 * Per-request (no rebuild required to toggle locally). Covers both pages
 * and API routes.
 */
export function middleware(req: NextRequest) {
  if (process.env.SHREDDY_SANDBOX !== "1") {
    return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = {
  matcher: ["/sandbox/:path*", "/api/sandbox/:path*"],
};
