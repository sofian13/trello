"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { setMyMemberId } from "@/lib/push";
import type { Member } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/login")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(setMembers)
      .catch(() => setError("Impossible de charger les pseudos."))
      .finally(() => setLoading(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: selected }),
    });
    if (res.ok) {
      setMyMemberId(selected);
      router.push(params.get("from") || "/");
      router.refresh();
      return;
    }
    setLoading(false);
    setError("Pseudo introuvable.");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-[26px] border border-border bg-surface p-7 shadow-[var(--card-shadow)]"
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto w-fit"><Logo size={48} /></div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">TeamBoard</h1>
          <p className="text-sm text-muted">Choisis ton pseudo</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {members.map((member) => {
            const active = member.id === selected;
            return (
              <button
                type="button"
                key={member.id}
                onClick={() => setSelected(member.id)}
                className="flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition"
                style={{
                  borderColor: active ? member.color : "var(--border)",
                  background: active ? `${member.color}18` : "var(--inset)",
                }}
              >
                <Avatar member={member} size={28} />
                <span className="truncate">{member.name}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading || !selected}
          className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {loading ? "Chargement…" : "Entrer"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
