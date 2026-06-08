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
import type { List, Card, Member, CardStatus } from "@/lib/types";

const STATUSES: { key: CardStatus; label: string; color: string }[] = [
  { key: "todo", label: "À faire", color: "#64748b" },
  { key: "in_progress", label: "En cours", color: "#f59e0b" },
  { key: "done", label: "Terminé", color: "#22c55e" },
];

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

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;

  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Card | null>(null);
  const [showMembers, setShowMembers] = useState(false);

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

  async function addCard(listId: string, title: string) {
    const pos = (cardsByList[listId]?.length ?? 0);
    const c = await createCard(listId, title, pos);
    setCards((prev) => [...prev, c]);
  }

  async function removeList(id: string) {
    if (!confirm("Supprimer cette colonne et ses cartes ?")) return;
    setLists((prev) => prev.filter((l) => l.id !== id));
    setCards((prev) => prev.filter((c) => c.list_id !== id));
    await deleteList(id);
  }

  if (loading) {
    return (
      <main className="min-h-dvh bg-slate-800 p-4 text-slate-200">Chargement…</main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-slate-800">
      <header className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <Link href="/" className="rounded px-2 py-1 hover:bg-white/10">
          ← Tableaux
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {members.slice(0, 6).map((m) => (
              <Avatar key={m.id} member={m} />
            ))}
          </div>
          <button
            onClick={() => setShowMembers(true)}
            className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/20"
          >
            👥 Membres
          </button>
        </div>
      </header>

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="board" direction="horizontal" type="list">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-1 items-start gap-3 overflow-x-auto px-4 pb-4"
            >
              {lists.map((list, index) => (
                <Draggable key={list.id} draggableId={list.id} index={index}>
                  {(prov) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      className="flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100"
                    >
                      <ListHeader
                        list={list}
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
                            className={`flex-1 space-y-2 overflow-y-auto px-2 ${
                              snap.isDraggingOver ? "bg-slate-200" : ""
                            }`}
                          >
                            {(cardsByList[list.id] ?? []).map((card, ci) => (
                              <Draggable
                                key={card.id}
                                draggableId={card.id}
                                index={ci}
                              >
                                {(cp) => (
                                  <div
                                    ref={cp.innerRef}
                                    {...cp.draggableProps}
                                    {...cp.dragHandleProps}
                                    onClick={() => setEditing(card)}
                                    className="cursor-pointer overflow-hidden rounded-lg bg-white text-sm text-slate-800 shadow-sm hover:bg-slate-50"
                                  >
                                    {card.color && (
                                      <div
                                        style={{ background: card.color }}
                                        className="h-1.5 w-full"
                                      />
                                    )}
                                    <div className="p-2">
                                      <div>
                                        {card.title}
                                        {card.description && (
                                          <span className="ml-1 text-slate-400">
                                            ≡
                                          </span>
                                        )}
                                      </div>
                                      {(card.status !== "none" ||
                                        card.assignee_ids.length > 0) && (
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                          {(() => {
                                            const st = STATUSES.find(
                                              (s) => s.key === card.status
                                            );
                                            return st ? (
                                              <span
                                                style={{
                                                  background: st.color + "22",
                                                  color: st.color,
                                                }}
                                                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                                              >
                                                {st.label}
                                              </span>
                                            ) : (
                                              <span />
                                            );
                                          })()}
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

                      <AddCard onAdd={(t) => addCard(list.id, t)} />
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              <AddList onAdd={addList} />
            </div>
          )}
        </Droppable>
      </DragDropContext>

      {editing && (
        <CardModal
          card={editing}
          members={members}
          onAddMember={addMember}
          onClose={() => setEditing(null)}
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
            setEditing(null);
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
  dragHandleProps,
  onRename,
  onDelete,
}: {
  list: List;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> | null | undefined;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  return (
    <div
      {...dragHandleProps}
      className="flex items-center justify-between gap-2 p-2"
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
          className="w-full rounded border border-slate-300 px-1 text-sm font-semibold text-slate-800"
        />
      ) : (
        <h2
          onClick={() => setEditing(true)}
          className="flex-1 cursor-text text-sm font-semibold text-slate-700"
        >
          {list.name}
        </h2>
      )}
      <button
        onClick={onDelete}
        className="text-slate-400 hover:text-red-500"
        aria-label="Supprimer la colonne"
      >
        ✕
      </button>
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="m-2 rounded-lg px-2 py-1 text-left text-sm text-slate-500 hover:bg-slate-200"
      >
        + Ajouter une carte
      </button>
    );
  }
  return (
    <div className="p-2">
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (title.trim()) onAdd(title.trim());
            setTitle("");
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Titre de la carte…"
        className="w-full resize-none rounded-lg border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
      />
      <div className="mt-1 flex gap-2">
        <button
          onClick={() => {
            if (title.trim()) onAdd(title.trim());
            setTitle("");
            setOpen(false);
          }}
          className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
        >
          Ajouter
        </button>
        <button
          onClick={() => setOpen(false)}
          className="text-sm text-slate-500"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function AddList({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-72 shrink-0 rounded-xl bg-white/20 px-3 py-2 text-left text-sm text-white hover:bg-white/30"
      >
        + Ajouter une colonne
      </button>
    );
  }
  return (
    <div className="w-72 shrink-0 rounded-xl bg-slate-100 p-2">
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
  members,
  onAddMember,
  onClose,
  onChange,
  onDelete,
}: {
  card: Card;
  members: Member[];
  onAddMember: (name: string) => Promise<Member>;
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
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onChange({ title: title.trim() || card.title })}
          className="w-full rounded-lg border border-slate-300 p-2 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />

        {/* Statut */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          Statut
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onChange({ status: "none" })}
            className={`rounded-full border px-3 py-1 text-sm ${
              card.status === "none"
                ? "border-slate-400 bg-slate-100"
                : "border-slate-200"
            }`}
          >
            Aucun
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => onChange({ status: s.key })}
              style={
                card.status === s.key
                  ? { background: s.color, color: "white", borderColor: s.color }
                  : { color: s.color, borderColor: s.color }
              }
              className="rounded-full border px-3 py-1 text-sm font-medium"
            >
              {s.label}
            </button>
          ))}
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

        {/* Description */}
        <p className="mt-4 mb-1 text-xs font-semibold uppercase text-slate-400">
          Description
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => onChange({ description })}
          placeholder="Détails…"
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
