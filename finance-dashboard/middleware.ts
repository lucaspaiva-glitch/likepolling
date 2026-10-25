import { NextResponse, type NextRequest } from "next/server";

// HTTP Basic Auth with DASHBOARD_BASIC_AUTH="user:password". Optional locally; on Vercel the
// app refuses to serve without it. The cron and Plaid webhook routes carry their own auth.
const SELF_AUTHENTICATED = ["/api/cron/", "/api/plaid/webhook"];

export function middleware(req: NextRequest) {
  if (SELF_AUTHENTICATED.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  const expected = process.env.DASHBOARD_BASIC_AUTH;
  if (!expected) {
    if (process.env.VERCEL) return new NextResponse("Set DASHBOARD_BASIC_AUTH to enable this deployment", { status: 503 });
    return NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      if (atob(header.slice(6)) === expected) return NextResponse.next();
    } catch {}
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="finance-dashboard"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
