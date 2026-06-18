import { NextResponse } from "next/server";
import { MEMBER_COOKIE } from "@/lib/auth";
import { fetchMembers } from "@/lib/db";

export async function GET() {
  const members = await fetchMembers();
  return NextResponse.json(
    members.map(({ id, name, color }) => ({ id, name, color }))
  );
}

export async function POST(req: Request) {
  const { memberId } = await req.json().catch(() => ({ memberId: "" }));
  const members = await fetchMembers();
  const member = members.find((item) => item.id === memberId);

  if (!member) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, member });
  res.cookies.set(MEMBER_COOKIE, member.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}
