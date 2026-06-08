"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchBoards, createBoardWithDefaults, deleteBoard } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Board } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");

  async function load() {
    try {
      setBoards(await fetchBoards());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("boards-home")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "boards" },
        load
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setName("");
    const b = await createBoardWithDefaults(n);
    setBoards((prev) => [...prev, b]);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer ce tableau et toutes ses cartes ?")) return;
    setBoards((prev) => prev.filter((b) => b.id !== id));
    await deleteBoard(id);
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 text-base shadow-lg">
            🗂️
          </span>
          TeamBoard
        </h1>
        <button
          onClick={logout}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-sm text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          Déconnexion
        </button>
      </header>

      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <h2 className="mb-1 text-2xl font-bold tracking-tight">Tes tableaux</h2>
        <p className="mb-5 text-sm text-white/50">
          Organise le travail de l&apos;équipe, en temps réel.
        </p>

        <form onSubmit={add} className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du nouveau tableau…"
            className="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-white placeholder:text-white/40 outline-none transition focus:border-sky-400/60 focus:bg-white/15"
          />
          <button
            type="submit"
            className="rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 px-5 py-2.5 font-medium text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110"
          >
            Créer
          </button>
        </form>

        {loading ? (
          <p className="animate-pulse text-white/40">Chargement…</p>
        ) : boards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 p-10 text-center text-white/50">
            Aucun tableau pour l&apos;instant.
            <br />
            Crée le premier ☝️
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {boards.map((b) => (
              <li key={b.id} className="group relative">
                <Link
                  href={`/board/${b.id}`}
                  className="block overflow-hidden rounded-2xl border border-white/10 bg-white/10 p-4 shadow-lg backdrop-blur-sm transition hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-xl"
                >
                  <span className="mb-3 block h-1 w-10 rounded-full bg-gradient-to-r from-sky-400 to-indigo-400" />
                  <span className="text-base font-semibold">{b.name}</span>
                </Link>
                <button
                  onClick={() => remove(b.id)}
                  className="absolute right-2.5 top-2.5 rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-red-400"
                  aria-label="Supprimer"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
