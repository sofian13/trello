import { savePushSubscription, deletePushSubscription } from "./db";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const ME_KEY = "tb_me"; // profil choisi sur cet appareil

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getMyMemberId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ME_KEY);
}

export function setMyMemberId(id: string) {
  try {
    localStorage.setItem(ME_KEY, id);
  } catch {}
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

// Active les notifs sur cet appareil pour le profil donné.
export async function enablePush(memberId: string): Promise<"ok" | "denied" | "unsupported"> {
  if (!isPushSupported() || !VAPID_PUBLIC) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    });
  }
  setMyMemberId(memberId);
  await savePushSubscription(sub.endpoint, sub.toJSON(), memberId);
  return "ok";
}

export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await deletePushSubscription(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
}

export async function isPushEnabled(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return !!sub && Notification.permission === "granted";
  } catch {
    return false;
  }
}

type NotifPayload = {
  title: string;
  body: string;
  url?: string;
  toMemberId?: string | null; // ciblé sur un profil ; sinon diffusé à tous
  toMemberIds?: string[]; // ciblé sur plusieurs profils
  excludeMemberId?: string | null; // ne pas notifier l'auteur
};

// Envoie une notif (best-effort, n'échoue jamais visiblement).
export async function sendNotification(payload: NotifPayload): Promise<void> {
  try {
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}
}
