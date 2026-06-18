"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Layers, Calendar, X, LogOut } from "lucide-react";
import {
  fetchBoards,
  fetchAllLists,
  fetchAllCards,
  fetchMembers,
  createBoardWithDefaults,
  deleteBoard,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { Board, List, Card, Member } from "@/lib/types";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import Avatar from "@/components/Avatar";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { getMyMemberId } from "@/lib/push";
import { canAccessBoard, isCoreMember } from "@/lib/auth";

const ACCENTS = ["#5B57F2", "#0CA678", "#F06595", "#0EA5E9", "#F08C00", "#9775FA"];

function tint(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},.13)`;
}

function statusOf(name: string): "todo" | "doing" | "done" {
  const n = name.toLowerCase();
  if (n.includes("cours")) return "doing";
  if (n.includes("termin")) return "done";
  return "todo";
}

export default function HomePage() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [myMemberId] = useState(() => getMyMemberId());
  const kb = useKeyboardInset();

  async function load() {
    try {
      const [b, l, c, m] = await Promise.all([
        fetchBoards(),
        fetchAllLists(),
        fetchAllCards(),
        fetchMembers(),
      ]);
      setBoards(b);
      setLists(l);
      setCards(c);
      setMembers(m);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("home")
      .on("postgres_changes", { event: "*", schema: "public", table: "boards" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const memById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  const me = myMemberId ? memById[myMemberId] : undefined;
  const canManage = isCoreMember(me?.name);
  const visibleBoards = useMemo(
    () => boards.filter((board) => canAccessBoard(me?.name, board.name)),
    [boards, me?.name]
  );

  // Stats par tableau
  const stats = useMemo(() => {
    const listsByBoard: Record<string, List[]> = {};
    for (const l of lists) (listsByBoard[l.board_id] ??= []).push(l);
    const statusByList: Record<string, "todo" | "doing" | "done"> = {};
    for (const l of lists) statusByList[l.id] = statusOf(l.name);

    return (boardId: string) => {
      const bl = listsByBoard[boardId] ?? [];
      const listIds = new Set(bl.map((l) => l.id));
      const bc = cards.filter((c) => listIds.has(c.list_id));
      const counts = { todo: 0, doing: 0, done: 0 };
      const assignees = new Set<string>();
      for (const c of bc) {
        counts[statusByList[c.list_id] ?? "todo"]++;
        c.assignee_ids.forEach((a) => assignees.add(a));
      }
      return {
        lists: bl.length,
        cards: bc.length,
        counts,
        members: [...assignees].map((id) => memById[id]).filter(Boolean),
      };
    };
  }, [lists, cards, memById]);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    setCreating(false);
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
    try {
      localStorage.removeItem("tb_me");
    } catch {}
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Logo size={30} />
          <span className="text-base font-bold tracking-[-0.02em]">TeamBoard</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/meetings"
            aria-label="Réunions"
            className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted transition hover:text-text"
          >
            <Calendar size={18} />
          </Link>
          <ThemeToggle />
          <button
            onClick={logout}
            aria-label="Se déconnecter"
            className="grid h-9 w-9 place-items-center rounded-xl text-white"
            style={{ background: "linear-gradient(135deg,#6C5CE7,#5B57F2)" }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div className="px-5 pb-28">
        <h1 className="text-[25px] font-bold tracking-[-0.025em]">Tes tableaux</h1>
        <p className="mt-0.5 font-mono text-[11px] text-faint">
          {visibleBoards.length} espace{visibleBoards.length > 1 ? "s" : ""} · sync en direct
        </p>

        {loading ? (
          <p className="mt-8 font-mono text-sm text-faint">Chargement…</p>
        ) : visibleBoards.length === 0 ? (
          <div className="mt-8 rounded-[18px] border border-dashed border-border bg-surface p-10 text-center text-muted">
            Aucun tableau ne t&apos;est attribué pour le moment.
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {visibleBoards.map((b, i) => {
              const s = stats(b.id);
              const accent = ACCENTS[i % ACCENTS.length];
              const total = s.counts.todo + s.counts.doing + s.counts.done || 1;
              return (
                <li key={b.id} className="anim-pop">
                  <Link
                    href={`/board/${b.id}`}
                    className="block rounded-[18px] border border-border bg-surface p-3.5 shadow-[var(--card-shadow)]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                        style={{ background: tint(accent), color: accent }}
                      >
                        <Layers size={19} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold">
                          {b.name}
                        </p>
                        <p className="font-mono text-[10.5px] text-faint">
                          {s.lists} liste{s.lists > 1 ? "s" : ""} · {s.cards} carte
                          {s.cards > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex">
                          {s.members.slice(0, 4).map((m, idx) => (
                            <span
                              key={m.id}
                              style={{ marginLeft: idx ? -7 : 0 }}
                            >
                              <Avatar member={m} size={23} />
                            </span>
                          ))}
                        </div>
                        {canManage && (
                          <button
                          onClick={(e) => {
                            e.preventDefault();
                            remove(b.id);
                          }}
                          aria-label="Supprimer"
                          className="text-faint transition hover:text-danger"
                        >
                          <Trash2 size={17} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Barre de progression */}
                    <div className="mt-3 flex h-[5px] gap-[3px] overflow-hidden rounded-full">
                      <span
                        style={{ flex: s.counts.todo, background: "var(--track)" }}
                        className="rounded-full"
                      />
                      <span
                        style={{ flex: s.counts.doing, background: "#F0B429" }}
                        className="rounded-full"
                      />
                      <span
                        style={{ flex: s.counts.done, background: "#0CA678" }}
                        className="rounded-full"
                      />
                      {total === 1 &&
                        s.counts.todo + s.counts.doing + s.counts.done === 0 && (
                          <span
                            style={{ flex: 1, background: "var(--track)" }}
                            className="rounded-full"
                          />
                        )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {canManage && (
      <>
      {/* FAB */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg to-transparent" />
      <button
        onClick={() => setCreating(true)}
        className="fixed bottom-6 right-5 flex h-12 items-center gap-1.5 rounded-2xl px-5 text-sm font-semibold text-white"
        style={{ background: "var(--primary)", boxShadow: "var(--fab-shadow)" }}
      >
        <Plus size={18} />
        Nouveau
      </button>

      {creating && (
        <div
          className="anim-fade fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "var(--scrim)", paddingBottom: kb }}
          onClick={() => setCreating(false)}
        >
          <div
            className="anim-sheet w-full max-w-md rounded-t-[26px] bg-surface p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-track" />
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[19px] font-bold tracking-[-0.02em]">
                Nouveau tableau
              </h2>
              <button
                onClick={() => setCreating(false)}
                className="grid h-8 w-8 place-items-center rounded-lg bg-inset text-muted"
              >
                <X size={18} />
              </button>
            </div>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Nom du tableau…"
              className="w-full rounded-xl border border-border bg-inset px-4 py-3 text-text outline-none placeholder:text-faint"
            />
            <button
              onClick={add}
              className="mt-3 w-full rounded-xl py-3 font-semibold text-solid-text"
              style={{ background: "var(--solid)" }}
            >
              Créer
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </main>
  );
}
