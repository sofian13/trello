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
    <main className="min-h-dvh bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-800">🗂️ TeamBoard</h1>
        <button
          onClick={logout}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          Déconnexion
        </button>
      </header>

      <div className="mx-auto max-w-3xl p-4">
        <form onSubmit={add} className="mb-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du nouveau tableau…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-white hover:bg-sky-700"
          >
            Créer
          </button>
        </form>

        {loading ? (
          <p className="text-slate-400">Chargement…</p>
        ) : boards.length === 0 ? (
          <p className="text-slate-400">Aucun tableau. Crée le premier ☝️</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {boards.map((b) => (
              <li key={b.id} className="group relative">
                <Link
                  href={`/board/${b.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <span className="font-medium text-slate-800">{b.name}</span>
                </Link>
                <button
                  onClick={() => remove(b.id)}
                  className="absolute right-2 top-2 hidden rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 group-hover:block"
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
