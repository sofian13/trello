import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Routes publiques
  if (pathname.startsWith("/login") || pathname.startsWith("/api/login")) {
    return NextResponse.next();
  }

  const expected = await authToken(process.env.APP_PASSWORD || "");
  const cookie = req.cookies.get(AUTH_COOKIE)?.value;

  if (cookie !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Protège tout sauf les assets statiques, le SW et le manifest
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons|file.svg|globe.svg|next.svg|vercel.svg|window.svg).*)",
  ],
};
