import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

if (PUBLIC && PRIVATE) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
}

type Row = {
  endpoint: string;
  subscription: webpush.PushSubscription;
  member_id: string | null;
};

export async function POST(req: Request) {
  if (!PUBLIC || !PRIVATE) {
    return NextResponse.json({ ok: false, reason: "vapid-missing" });
  }

  const { title, body, url, toMemberId, excludeMemberId } = await req
    .json()
    .catch(() => ({}));

  if (!title) return NextResponse.json({ ok: false, reason: "no-title" });

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, subscription, member_id");
  if (error) return NextResponse.json({ ok: false, reason: error.message });

  let rows = (data ?? []) as Row[];
  if (toMemberId) rows = rows.filter((r) => r.member_id === toMemberId);
  if (excludeMemberId)
    rows = rows.filter((r) => r.member_id !== excludeMemberId);

  const payload = JSON.stringify({
    title,
    body: body || "",
    url: url || "/",
    tag: "teamboard",
  });

  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification(r.subscription, payload);
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(r.endpoint);
      }
    })
  );

  // Nettoie les abonnements morts
  if (dead.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", dead);
  }

  return NextResponse.json({ ok: true, sent, removed: dead.length });
}
