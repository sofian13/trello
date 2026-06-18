import { NextRequest, NextResponse } from "next/server";
import { MEMBER_COOKIE } from "@/lib/auth";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const memberId = req.cookies.get(MEMBER_COOKIE)?.value;
  if (!memberId) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)",
  ],
};
