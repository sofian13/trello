import { NextResponse } from "next/server";
import { MEMBER_COOKIE, normalizeMemberName } from "@/lib/auth";
import { fetchMembers } from "@/lib/db";

export async function POST(req: Request) {
  const { pseudo } = await req.json().catch(() => ({ pseudo: "" }));
  const normalizedPseudo =
    typeof pseudo === "string" ? normalizeMemberName(pseudo) : "";
  const members = await fetchMembers();
  const member = members.find(
    (item) => normalizeMemberName(item.name) === normalizedPseudo
  );

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
