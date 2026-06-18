"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound } from "lucide-react";
import Logo from "@/components/Logo";
import { setMyMemberId } from "@/lib/push";
import type { Member } from "@/lib/types";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pseudo.trim()) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo: pseudo.trim() }),
    });

    if (res.ok) {
      const { member } = (await res.json()) as { member: Member };
      setMyMemberId(member.id);
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
          <div className="mx-auto w-fit">
            <Logo size={48} />
          </div>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">TeamBoard</h1>
          <p className="text-sm text-muted">Entre ton pseudo pour continuer</p>
        </div>

        <label className="block">
          <span className="sr-only">Ton pseudo</span>
          <span className="flex items-center gap-3 rounded-xl border border-border bg-inset px-4 transition focus-within:border-primary">
            <UserRound size={18} className="shrink-0 text-faint" />
            <input
              type="text"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={pseudo}
              onChange={(event) => {
                setPseudo(event.target.value);
                if (error) setError("");
              }}
              placeholder="Ton pseudo"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-text outline-none placeholder:text-faint"
            />
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !pseudo.trim()}
          className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {loading ? "Vérification…" : "Entrer"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
