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
    <main className="min-h-dvh flex items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4"
      >
        <div className="text-center space-y-1">
          <div className="text-3xl">🗂️</div>
          <h1 className="text-xl font-bold text-slate-800">TeamBoard</h1>
          <p className="text-sm text-slate-500">Entre le mot de passe d&apos;équipe</p>
        </div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />
        {error && (
          <p className="text-sm text-red-500">Mot de passe incorrect.</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-sky-600 py-2 font-medium text-white hover:bg-sky-700 disabled:opacity-50"
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
