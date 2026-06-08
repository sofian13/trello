"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-3xl border border-white/10 bg-white/10 p-7 shadow-2xl backdrop-blur-xl"
      >
        <div className="space-y-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-500 text-2xl shadow-lg">
            🗂️
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">TeamBoard</h1>
          <p className="text-sm text-white/50">Entre le mot de passe d&apos;équipe</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/40 outline-none transition focus:border-sky-400/60 focus:bg-white/15"
        />
        {error && (
          <p className="text-sm text-red-400">Mot de passe incorrect.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 py-2.5 font-medium text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110 disabled:opacity-50"
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
