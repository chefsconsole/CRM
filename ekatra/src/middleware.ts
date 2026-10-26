import { NextResponse, type NextRequest } from "next/server";

// Fast path only: bounce requests without a session cookie. Real authentication and
// authorisation happen on the server for every page, action and API route.
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login") && !req.cookies.get("ek_team")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
