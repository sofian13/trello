"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(false);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push(params.get("from") || "/");
      router.refresh();
    } else {
      setError(true);
    }
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
          <p className="text-sm text-muted">Entre le mot de passe d&apos;équipe</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full rounded-xl border border-border bg-inset px-4 py-3 text-text outline-none placeholder:text-faint"
        />
        {error && <p className="text-sm text-danger">Mot de passe incorrect.</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--primary)" }}
        >
          {loading ? "..." : "Entrer"}
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
