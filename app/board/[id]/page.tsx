"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabase";
import {
  fetchBoard,
  fetchLists,
  fetchCards,
  createList,
  renameList,
  deleteList,
  updateListPosition,
  createCard,
  updateCard,
  deleteCard,
  fetchMembers,
  createMember,
  deleteMember,
} from "@/lib/db";
import type { List, Card, Member } from "@/lib/types";

const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

const MEMBER_COLORS = [
  "#0284c7",
  "#16a34a",
  "#dc2626",
  "#9333ea",
  "#ea580c",
  "#0d9488",
  "#db2777",
  "#475569",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function Avatar({ member, size = 24 }: { member: Member; size?: number }) {
  return (
    <span
      title={member.name}
      style={{ background: member.color, width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white"
    >
      {initials(member.name)}
    </span>
  );
}

// Couleur d'accent d'une colonne d'après son nom (statut).
function columnAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("faire")) return "#64748b";
  if (n.includes("cours")) return "#f59e0b";
  if (n.includes("termin")) return "#22c55e";
  return "#0ea5e9";
}

function IconColumns() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
      <rect x="6.25" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
      <rect x="11" y="2.5" width="3.5" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconRows() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2.5" y="1.5" width="11" height="3.5" rx="1" fill="currentColor" />
      <rect x="2.5" y="6.25" width="11" height="3.5" rx="1" fill="currentColor" />
      <rect x="2.5" y="11" width="11" height="3.5" rx="1" fill="currentColor" />
    </svg>
  );
}

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;

  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Card | null>(null);
  const [editingNew, setEditingNew] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [layout, setLayout] = useState<"horizontal" | "vertical">("horizontal");

  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("tb_layout") : null;
    if (saved === "vertical" || saved === "horizontal") setLayout(saved);
  }, []);

  function changeLayout(l: "horizontal" | "vertical") {
    setLayout(l);
    try {
      localStorage.setItem("tb_layout", l);
    } catch {}
  }

  async function load() {
    const ls = await fetchLists(boardId);
    setLists(ls);
    setCards(await fetchCards(ls.map((l) => l.id)));
    setLoading(false);
  }

  async function loadMembers() {
    setMembers(await fetchMembers());
  }

  useEffect(() => {
    load();
    loadMembers();
    fetchBoard(boardId).then((b) => b && setBoardName(b.name));
    const ch = supabase
      .channel(`board-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "members" },
        loadMembers
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  const membersById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  async function addMember(name: string): Promise<Member> {
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const m = await createMember(name, color);
    setMembers((prev) => [...prev, m]);
    return m;
  }

  async function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    // retire l'assignation de cette personne sur toutes les cartes affichées
    setCards((prev) =>
      prev.map((c) =>
        c.assignee_ids.includes(id)
          ? { ...c, assignee_ids: c.assignee_ids.filter((a) => a !== id) }
          : c
      )
    );
    await deleteMember(id);
  }

  const cardsByList = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const l of lists) map[l.id] = [];
    for (const c of cards) (map[c.list_id] ??= []).push(c);
    for (const id in map) map[id].sort((a, b) => a.position - b.position);
    return map;
  }, [lists, cards]);

  async function onDragEnd(result: DropResult) {
    const { source, destination, type, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    // --- Réordonner les colonnes ---
    if (type === "list") {
      const next = [...lists];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      setLists(next);
      await Promise.all(
        next.map((l, i) =>
          l.position !== i ? updateListPosition(l.id, i) : Promise.resolve()
        )
      );
      return;
    }

    // --- Déplacer une carte ---
    const fromId = source.droppableId;
    const toId = destination.droppableId;
    const from = [...(cardsByList[fromId] ?? [])];
    const to =
      fromId === toId ? from : [...(cardsByList[toId] ?? [])];

    const idx = from.findIndex((c) => c.id === draggableId);
    if (idx === -1) return;
    const [moved] = from.splice(idx, 1);
    moved.list_id = toId;
    to.splice(destination.index, 0, moved);

    // Mise à jour optimiste de l'état local
    setCards((prev) => {
      const others = prev.filter(
        (c) => c.list_id !== fromId && c.list_id !== toId
      );
      const reindex = (arr: Card[], listId: string) =>
        arr.map((c, i) => ({ ...c, list_id: listId, position: i }));
      return [
        ...others,
        ...reindex(from, fromId),
        ...(fromId === toId ? [] : reindex(to, toId)),
      ];
    });

    // Persistance
    const writes: Promise<unknown>[] = [];
    to.forEach((c, i) =>
      writes.push(updateCard(c.id, { list_id: toId, position: i }))
    );
    if (fromId !== toId) {
      from.forEach((c, i) => writes.push(updateCard(c.id, { position: i })));
    }
    await Promise.all(writes);
  }

  async function addList(name: string) {
    const pos = lists.length;
    const l = await createList(boardId, name, pos);
    setLists((prev) => [...prev, l]);
  }

  // Crée une carte et ouvre directement l'éditeur complet (focus sur le titre).
  async function addCardAndOpen(listId: string) {
    const pos = cardsByList[listId]?.length ?? 0;
    const c = await createCard(listId, "Nouvelle tâche", pos);
    setCards((prev) => [...prev, c]);
    setEditingNew(true);
    setEditing(c);
  }

  function openCard(card: Card) {
    setEditingNew(false);
    setEditing(card);
  }

  function closeCard() {
    setEditing(null);
    setEditingNew(false);
  }

  async function removeList(id: string) {
    if (!confirm("Supprimer cette colonne et ses cartes ?")) return;
    setLists((prev) => prev.filter((l) => l.id !== id));
    setCards((prev) => prev.filter((c) => c.list_id !== id));
    await deleteList(id);
  }

  // Déplacer une carte vers une colonne en cliquant (= changer son statut)
  async function moveCardToList(card: Card, listId: string) {
    if (card.list_id === listId) return;
    const pos = cardsByList[listId]?.length ?? 0;
    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id ? { ...c, list_id: listId, position: pos } : c
      )
    );
    setEditing((cur) =>
      cur && cur.id === card.id ? { ...cur, list_id: listId, position: pos } : cur
    );
    await updateCard(card.id, { list_id: listId, position: pos });
  }

  const isV = layout === "vertical";

  if (loading) {
    return (
      <main className="grid h-dvh place-items-center bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white/70">
        <div className="animate-pulse text-sm">Chargement…</div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/5 px-3 py-2.5 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20"
            aria-label="Retour aux tableaux"
          >
            ←
          </Link>
          <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
            {boardName || "Tableau"}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Bascule disposition */}
          <div className="flex rounded-xl bg-white/10 p-0.5">
            <button
              onClick={() => changeLayout("horizontal")}
              title="Colonnes côte à côte"
              className={`grid h-8 w-9 place-items-center rounded-lg transition ${
                !isV ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
              }`}
            >
              <IconColumns />
            </button>
            <button
              onClick={() => changeLayout("vertical")}
              title="Colonnes empilées (sans swipe)"
              className={`grid h-8 w-9 place-items-center rounded-lg transition ${
                isV ? "bg-white text-slate-900" : "text-white/60 hover:text-white"
              }`}
            >
              <IconRows />
            </button>
          </div>

          <div className="hidden -space-x-2 sm:flex">
            {members.slice(0, 5).map((m) => (
              <Avatar key={m.id} member={m} />
            ))}
          </div>
          <button
            onClick={() => setShowMembers(true)}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm transition hover:bg-white/20"
          >
            👥<span className="hidden sm:inline">Membres</span>
          </button>
        </div>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable
          droppableId="board"
          direction={isV ? "vertical" : "horizontal"}
          type="list"
        >
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={
                isV
                  ? "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 overflow-y-auto p-4"
                  : "flex flex-1 items-start gap-4 overflow-x-auto p-4"
              }
            >
              {lists.map((list, index) => {
                const accent = columnAccent(list.name);
                const count = cardsByList[list.id]?.length ?? 0;
                return (
                  <Draggable key={list.id} draggableId={list.id} index={index}>
                    {(prov) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`flex flex-col rounded-2xl bg-white/95 shadow-xl shadow-black/20 ring-1 ring-black/5 ${
                          isV ? "w-full" : "max-h-full w-[300px] shrink-0"
                        }`}
                      >
                        <div
                          style={{ background: accent }}
                          className="h-1.5 rounded-t-2xl"
                        />
                        <ListHeader
                          list={list}
                          accent={accent}
                          count={count}
                          dragHandleProps={prov.dragHandleProps}
                          onRename={(name) => {
                            setLists((prev) =>
                              prev.map((l) =>
                                l.id === list.id ? { ...l, name } : l
                              )
                            );
                            renameList(list.id, name);
                          }}
                          onDelete={() => removeList(list.id)}
                        />

                        <Droppable droppableId={list.id} type="card">
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.droppableProps}
                              className={`min-h-[3.5rem] space-y-2 px-2 pb-2 transition-colors ${
                                isV ? "" : "flex-1 overflow-y-auto"
                              } ${
                                snap.isDraggingOver
                                  ? "bg-sky-50 ring-2 ring-inset ring-sky-300"
                                  : ""
                              }`}
                            >
                              {(cardsByList[list.id] ?? []).map((card, ci) => (
                                <Draggable
                                  key={card.id}
                                  draggableId={card.id}
                                  index={ci}
                                >
                                  {(cp, csnap) => (
                                    <div
                                      ref={cp.innerRef}
                                      {...cp.draggableProps}
                                      {...cp.dragHandleProps}
                                      onClick={() => openCard(card)}
                                      className={`group cursor-pointer overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md ${
                                        csnap.isDragging
                                          ? "rotate-1 shadow-lg"
                                          : ""
                                      }`}
                                    >
                                      {card.color && (
                                        <div
                                          style={{ background: card.color }}
                                          className="h-1.5 w-full"
                                        />
                                      )}
                                      <div className="p-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-[13px] font-medium leading-snug text-slate-800">
                                            {card.title}
                                          </p>
                                          {card.description && (
                                            <span className="shrink-0 text-xs text-slate-300">
                                              📝
                                            </span>
                                          )}
                                        </div>
                                        {card.assignee_ids.length > 0 && (
                                          <div className="mt-2 flex justify-end">
                                            <div className="flex -space-x-2">
                                              {card.assignee_ids
                                                .map((id) => membersById[id])
                                                .filter(Boolean)
                                                .slice(0, 4)
                                                .map((m) => (
                                                  <Avatar
                                                    key={m.id}
                                                    member={m}
                                                    size={22}
                                                  />
                                                ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {p.placeholder}
                            </div>
                          )}
                        </Droppable>

                        <AddCard onAdd={() => addCardAndOpen(list.id)} />
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
              <AddList onAdd={addList} vertical={isV} />
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editing && (
        <CardModal
          card={editing}
          isNew={editingNew}
          lists={lists}
          members={members}
          onAddMember={addMember}
          onMove={(listId) => moveCardToList(editing, listId)}
          onClose={closeCard}
          onChange={(fields) => {
            setCards((prev) =>
              prev.map((c) => (c.id === editing.id ? { ...c, ...fields } : c))
            );
            setEditing((cur) => (cur ? { ...cur, ...fields } : cur));
            updateCard(editing.id, fields);
          }}
          onDelete={() => {
            setCards((prev) => prev.filter((c) => c.id !== editing.id));
            deleteCard(editing.id);
            closeCard();
          }}
        />
      )}

      {showMembers && (
        <MembersModal
          members={members}
          onClose={() => setShowMembers(false)}
          onAdd={addMember}
          onDelete={removeMember}
        />
      )}
    </main>
  );
}

/* ---------- sous-composants ---------- */

function ListHeader({
  list,
  accent,
  count,
  dragHandleProps,
  onRename,
  onDelete,
}: {
  list: List;
  accent: string;
  count: number;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> | null | undefined;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  return (
    <div
      {...dragHandleProps}
      className="flex items-center justify-between gap-2 px-3 py-2.5"
    >
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (name.trim()) onRename(name.trim());
            else setName(list.name);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full rounded border border-slate-300 px-1 text-sm font-bold text-slate-800"
        />
      ) : (
        <h2
          onClick={() => setEditing(true)}
          className="flex flex-1 cursor-text items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-700"
        >
          <span
            style={{ background: accent }}
            className="h-2.5 w-2.5 shrink-0 rounded-full"
          />
          <span className="truncate">{list.name}</span>
          <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-400">
            {count}
          </span>
        </h2>
      )}
      <button
        onClick={onDelete}
        className="shrink-0 text-slate-300 transition hover:text-red-500"
        aria-label="Supprimer la colonne"
      >
        ✕
      </button>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="m-2 rounded-lg px-2 py-1 text-left text-sm font-medium text-slate-500 hover:bg-slate-200"
    >
      + Ajouter une carte
    </button>
  );
}

function AddList({
  onAdd,
  vertical,
}: {
  onAdd: (name: string) => void;
  vertical: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const width = vertical ? "w-full" : "w-[300px] shrink-0";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`${width} rounded-2xl border border-dashed border-white/25 bg-white/5 px-3 py-2.5 text-left text-sm text-white/70 transition hover:bg-white/10 hover:text-white`}
      >
        + Ajouter une colonne
      </button>
    );
  }
  return (
    <div className={`${width} rounded-2xl bg-white/95 p-2 shadow-xl`}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) {
            onAdd(name.trim());
            setName("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Nom de la colonne…"
        className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
      />
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => {
            if (name.trim()) onAdd(name.trim());
            setName("");
            setOpen(false);
          }}
          className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
        >
          Ajouter
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-slate-500">
          Annuler
        </button>
      </div>
    </div>
  );
}

function CardModal({
  card,
  isNew,
  lists,
  members,
  onAddMember,
  onMove,
  onClose,
  onChange,
  onDelete,
}: {
  card: Card;
  isNew: boolean;
  lists: List[];
  members: Member[];
  onAddMember: (name: string) => Promise<Member>;
  onMove: (listId: string) => void;
  onClose: () => void;
  onChange: (fields: Partial<Card>) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [newMember, setNewMember] = useState("");

  function toggleAssignee(id: string) {
    const next = card.assignee_ids.includes(id)
      ? card.assignee_ids.filter((a) => a !== id)
      : [...card.assignee_ids, id];
    onChange({ assignee_ids: next });
  }

  async function quickAdd() {
    const n = newMember.trim();
    if (!n) return;
    setNewMember("");
    const m = await onAddMember(n);
    onChange({ assignee_ids: [...card.assignee_ids, m.id] });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={title}
          autoFocus={isNew}
          onFocus={(e) => {
            if (isNew) e.target.select();
          }}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onChange({ title: title.trim() || "Nouvelle tâche" })}
          placeholder="Titre de la tâche"
          className="w-full rounded-lg border border-slate-300 p-2 text-base font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />

        {/* Déplacer vers une colonne (= changer le statut) */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          Colonne / statut
        </p>
        <div className="flex flex-wrap gap-2">
          {lists.map((l) => {
            const current = card.list_id === l.id;
            return (
              <button
                key={l.id}
                onClick={() => onMove(l.id)}
                className={`rounded-full border px-3 py-1 text-sm font-medium ${
                  current
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-slate-300 text-slate-600 hover:bg-slate-100"
                }`}
              >
                {l.name}
              </button>
            );
          })}
        </div>

        {/* Couleur */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          Couleur
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onChange({ color: null })}
            className={`h-7 w-7 rounded-full border-2 text-xs text-slate-400 ${
              !card.color ? "border-slate-400" : "border-slate-200"
            }`}
            title="Aucune"
          >
            ✕
          </button>
          {LABEL_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChange({ color: c })}
              style={{ background: c }}
              className={`h-7 w-7 rounded-full ${
                card.color === c ? "ring-2 ring-offset-2 ring-slate-500" : ""
              }`}
            />
          ))}
        </div>

        {/* Assignés */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          C&apos;est qui ?
        </p>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const on = card.assignee_ids.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleAssignee(m.id)}
                style={
                  on
                    ? { background: m.color, color: "white", borderColor: m.color }
                    : { borderColor: m.color, color: m.color }
                }
                className="flex items-center gap-1 rounded-full border px-2 py-1 text-sm"
              >
                <span className="font-semibold">{initials(m.name)}</span>
                {m.name}
                {on && <span>✓</span>}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && quickAdd()}
            placeholder="+ Nouveau profil…"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            onClick={quickAdd}
            className="rounded-lg bg-slate-100 px-3 py-1 text-sm text-slate-700 hover:bg-slate-200"
          >
            Ajouter
          </button>
        </div>

        {/* Notes */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          📝 Notes
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onChange({ description })}
          placeholder="Ajoute des notes, détails, liens…"
          rows={4}
          className="w-full resize-none rounded-lg border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="rounded px-3 py-1 text-sm text-red-500 hover:bg-red-50"
          >
            Supprimer
          </button>
          <button
            onClick={onClose}
            className="rounded bg-sky-600 px-4 py-1 text-sm text-white hover:bg-sky-700"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function MembersModal({
  members,
  onClose,
  onAdd,
  onDelete,
}: {
  members: Member[];
  onClose: () => void;
  onAdd: (name: string) => Promise<Member>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    await onAdd(n);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold text-slate-800">👥 Profils</h2>
        <ul className="space-y-2">
          {members.length === 0 && (
            <li className="text-sm text-slate-400">Aucun profil pour l&apos;instant.</li>
          )}
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
            >
              <span className="flex items-center gap-2">
                <Avatar member={m} />
                <span className="text-sm text-slate-800">{m.name}</span>
              </span>
              <button
                onClick={() => onDelete(m.id)}
                className="text-slate-400 hover:text-red-500"
                aria-label="Supprimer le profil"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Nom de la personne…"
            className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            onClick={add}
            className="rounded-lg bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
          >
            Ajouter
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-600 hover:bg-slate-200"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
