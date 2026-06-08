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
} from "@/lib/db";
import type { List, Card } from "@/lib/types";

export default function BoardPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;

  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Card | null>(null);

  async function load() {
    const ls = await fetchLists(boardId);
    setLists(ls);
    setCards(await fetchCards(ls.map((l) => l.id)));
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`board-${boardId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

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
      <header className="flex items-center gap-3 px-4 py-3 text-white">
        <Link href="/" className="rounded px-2 py-1 hover:bg-white/10">
          ← Tableaux
        </Link>
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
                                    className="cursor-pointer rounded-lg bg-white p-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
                                  >
                                    {card.title}
                                    {card.description && (
                                      <span className="ml-1 text-slate-400">≡</span>
                                    )}
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
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            setCards((prev) =>
              prev.map((c) =>
                c.id === editing.id ? { ...c, ...fields } : c
              )
            );
            updateCard(editing.id, fields);
            setEditing(null);
          }}
          onDelete={() => {
            setCards((prev) => prev.filter((c) => c.id !== editing.id));
            deleteCard(editing.id);
            setEditing(null);
          }}
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
  onClose,
  onSave,
  onDelete,
}: {
  card: Card;
  onClose: () => void;
  onSave: (fields: { title: string; description: string }) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 font-medium text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description…"
          rows={5}
          className="mt-2 w-full resize-none rounded-lg border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-sky-400"
        />
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onDelete}
            className="rounded px-3 py-1 text-sm text-red-500 hover:bg-red-50"
          >
            Supprimer
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1 text-sm text-slate-500"
            >
              Annuler
            </button>
            <button
              onClick={() =>
                onSave({ title: title.trim() || card.title, description })
              }
              className="rounded bg-sky-600 px-3 py-1 text-sm text-white hover:bg-sky-700"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
