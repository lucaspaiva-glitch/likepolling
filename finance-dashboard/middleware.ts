import { NextResponse, type NextRequest } from "next/server";

// Optional HTTP Basic Auth: set DASHBOARD_BASIC_AUTH="user:password" to require it.
export function middleware(req: NextRequest) {
  const expected = process.env.DASHBOARD_BASIC_AUTH;
  if (!expected) return NextResponse.next();
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
