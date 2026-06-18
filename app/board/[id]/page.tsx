"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronLeft,
  Bell,
  Users,
  Plus,
  X,
  Trash2,
  Check,
  FileText,
  Columns3,
  Rows3,
  AlertTriangle,
  NotebookPen,
} from "lucide-react";
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
  fetchBoardNote,
  createBoardNote,
} from "@/lib/db";
import {
  enablePush,
  disablePush,
  isPushEnabled,
  isPushSupported,
  getMyMemberId,
  sendNotification,
} from "@/lib/push";
import type { List, Card, Member } from "@/lib/types";
import Avatar, { initials } from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import { canAccessBoard, isCoreMember } from "@/lib/auth";

const LABEL_COLORS = [
  "#E64980",
  "#F08C00",
  "#F0B429",
  "#0CA678",
  "#0EA5E9",
  "#5B57F2",
  "#9775FA",
  "#64748B",
];

const MEMBER_COLORS = [
  "#5B57F2",
  "#0CA678",
  "#F06595",
  "#0EA5E9",
  "#F08C00",
  "#9775FA",
];

// Couleur d'accent d'une colonne d'après son nom (statut).
function columnAccent(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cours")) return "#F0B429";
  if (n.includes("termin")) return "#0CA678";
  if (n.includes("faire")) return "#94A3B8";
  return "var(--primary)";
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function Sheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const kb = useKeyboardInset();
  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "var(--scrim)", paddingBottom: kb }}
      onClick={onClose}
    >
      <div
        className="anim-sheet max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-surface px-[18px] pb-[22px] pt-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-track" />
        {children}
      </div>
    </div>
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
  const [layout, setLayout] = useState<"horizontal" | "vertical">("vertical");
  const [showNotif, setShowNotif] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [boardNote, setBoardNote] = useState<Card | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteState, setNoteState] = useState<"saved" | "saving" | "error">(
    "saved"
  );
  const [myMemberId] = useState(() => getMyMemberId());
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteCreate = useRef<Promise<Card> | null>(null);
  const noteDirty = useRef(false);

  useEffect(() => {
    isPushEnabled().then(setPushOn);
  }, []);

  const boardUrl = `/board/${boardId}`;

  function notifyIfDone(listId: string, title: string) {
    const l = lists.find((x) => x.id === listId);
    if (l && l.name.toLowerCase().includes("termin")) {
      sendNotification({
        title: "Carte terminée",
        body: title,
        url: boardUrl,
        excludeMemberId: getMyMemberId(),
      });
    }
  }

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
    const listIds = ls.map((l) => l.id);
    const [nextCards, nextNote] = await Promise.all([
      fetchCards(listIds),
      fetchBoardNote(listIds),
    ]);
    setCards(nextCards);
    setBoardNote(nextNote);
    if (!noteDirty.current) setNoteText(nextNote?.description ?? "");
  }

  async function loadMembers() {
    setMembers(await fetchMembers());
  }

  useEffect(() => {
    Promise.all([
      load(),
      loadMembers(),
      fetchBoard(boardId).then((b) => b && setBoardName(b.name)),
    ]).finally(() => setLoading(false));
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

  useEffect(() => {
    return () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  const membersById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  const me = myMemberId ? membersById[myMemberId] : undefined;
  const isAdmin = isCoreMember(me?.name);
  const canManage = canAccessBoard(me?.name, boardName);
  const visibleCards = useMemo(
    () => (canManage ? cards : []),
    [canManage, cards]
  );

  async function addMember(name: string): Promise<Member> {
    const color = MEMBER_COLORS[members.length % MEMBER_COLORS.length];
    const m = await createMember(name, color);
    setMembers((prev) => [...prev, m]);
    return m;
  }

  async function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
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
    for (const c of visibleCards) (map[c.list_id] ??= []).push(c);
    for (const id in map) map[id].sort((a, b) => a.position - b.position);
    return map;
  }, [lists, visibleCards]);

  async function onDragEnd(result: DropResult) {
    const { source, destination, type, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    if (!canManage) {
      if (type === "list" || source.droppableId === destination.droppableId) return;
      const moved = cards.find((card) => card.id === draggableId);
      if (!moved) return;
      const position =
        Math.max(
          -1,
          ...cards
            .filter((card) => card.list_id === destination.droppableId)
            .map((card) => card.position)
        ) + 1;
      setCards((prev) =>
        prev.map((card) =>
          card.id === moved.id
            ? { ...card, list_id: destination.droppableId, position }
            : card
        )
      );
      notifyIfDone(destination.droppableId, moved.title);
      await updateCard(moved.id, {
        list_id: destination.droppableId,
        position,
      });
      return;
    }

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

    const fromId = source.droppableId;
    const toId = destination.droppableId;
    const from = [...(cardsByList[fromId] ?? [])];
    const to = fromId === toId ? from : [...(cardsByList[toId] ?? [])];

    const idx = from.findIndex((c) => c.id === draggableId);
    if (idx === -1) return;
    const [moved] = from.splice(idx, 1);
    moved.list_id = toId;
    to.splice(destination.index, 0, moved);

    if (fromId !== toId) notifyIfDone(toId, moved.title);

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
    if (
      editingNew &&
      editing &&
      editing.title.trim() &&
      editing.title !== "Nouvelle tâche"
    ) {
      sendNotification({
        title: "Nouvelle carte",
        body: `${boardName ? boardName + " — " : ""}${editing.title}`,
        url: boardUrl,
        excludeMemberId: getMyMemberId(),
      });
    }
    setEditing(null);
    setEditingNew(false);
  }

  async function moveCardToList(card: Card, listId: string) {
    if (card.list_id === listId) return;
    const pos = canManage
      ? cardsByList[listId]?.length ?? 0
      : Math.max(
          -1,
          ...cards
            .filter((item) => item.list_id === listId)
            .map((item) => item.position)
        ) + 1;
    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id ? { ...c, list_id: listId, position: pos } : c
      )
    );
    setEditing((cur) =>
      cur && cur.id === card.id ? { ...cur, list_id: listId, position: pos } : cur
    );
    notifyIfDone(listId, card.title);
    await updateCard(card.id, { list_id: listId, position: pos });
  }

  async function removeList(id: string) {
    if (!confirm("Supprimer cette colonne et ses cartes ?")) return;
    if (boardNote?.list_id === id) {
      const fallback = lists.find((list) => list.id !== id);
      if (fallback) {
        await updateCard(boardNote.id, { list_id: fallback.id });
        setBoardNote({ ...boardNote, list_id: fallback.id });
      }
    }
    setLists((prev) => prev.filter((l) => l.id !== id));
    setCards((prev) => prev.filter((c) => c.list_id !== id));
    await deleteList(id);
  }

  function changeNote(value: string) {
    setNoteText(value);
    setNoteState("saving");
    noteDirty.current = true;
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(async () => {
      try {
        let note = boardNote;
        if (!note && lists[0]) {
          noteCreate.current ??= createBoardNote(lists[0].id);
          note = await noteCreate.current;
          setBoardNote(note);
        }
        if (note) await updateCard(note.id, { description: value });
        setNoteState("saved");
      } catch {
        setNoteState("error");
      } finally {
        noteDirty.current = false;
      }
    }, 350);
  }

  const isV = layout === "vertical";

  if (loading) {
    return (
      <main className="grid h-dvh place-items-center bg-bg text-faint">
        <div className="animate-pulse font-mono text-sm">Chargement…</div>
      </main>
    );
  }

  if (!canManage) {
    return (
      <main className="grid h-dvh place-items-center bg-bg px-5 text-center text-text">
        <div>
          <p className="text-lg font-bold">Tableau non accessible</p>
          <p className="mt-1 text-sm text-muted">
            Ce tableau n&apos;est pas attribué à ton pseudo.
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--primary)" }}
          >
            Retour à mes tableaux
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-bg text-text">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-inset hover:text-text"
            aria-label="Retour"
          >
            <ChevronLeft size={22} />
          </Link>
          <h1 className="truncate text-[17px] font-bold tracking-[-0.02em]">
            {boardName || "Tableau"}
          </h1>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="flex rounded-xl border border-border bg-surface p-0.5">
            <button
              onClick={() => changeLayout("vertical")}
              title="Colonnes empilées"
              className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                isV ? "bg-inset text-text" : "text-faint"
              }`}
            >
              <Rows3 size={16} />
            </button>
            <button
              onClick={() => changeLayout("horizontal")}
              title="Colonnes côte à côte"
              className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                !isV ? "bg-inset text-text" : "text-faint"
              }`}
            >
              <Columns3 size={16} />
            </button>
          </div>

          <ThemeToggle />

          <button
            onClick={() => setShowNotes(true)}
            aria-label="Ouvrir le bloc-notes"
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted transition hover:text-text"
          >
            <NotebookPen size={18} />
            {noteText.trim() && (
              <span
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
                style={{ background: "#F0B429" }}
              />
            )}
          </button>

          <button
            onClick={() => setShowNotif(true)}
            aria-label="Notifications"
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted transition hover:text-text"
          >
            <Bell size={18} />
            {pushOn && (
              <span
                className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                style={{ background: "var(--primary)" }}
              />
            )}
          </button>

          {isAdmin && (
          <button
            onClick={() => setShowMembers(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-2 text-muted transition hover:text-text"
          >
            <Users size={18} />
            <div className="flex">
              {members.slice(0, 3).map((m, i) => (
                <span key={m.id} style={{ marginLeft: i ? -7 : 0 }}>
                  <Avatar member={m} size={22} />
                </span>
              ))}
            </div>
          </button>
          )}
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
                  ? "mx-auto flex w-full max-w-2xl flex-1 flex-col gap-3 overflow-y-auto px-4 pb-6"
                  : "flex flex-1 items-start gap-3 overflow-x-auto px-4 pb-6"
              }
            >
              {lists.map((list, index) => {
                const accent = columnAccent(list.name);
                const count = cardsByList[list.id]?.length ?? 0;
                return (
                  <Draggable
                    key={list.id}
                    draggableId={list.id}
                    index={index}
                    isDragDisabled={!canManage}
                  >
                    {(prov) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`flex flex-col ${
                          isV ? "w-full" : "max-h-full w-[300px] shrink-0"
                        }`}
                      >
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
                          canManage={canManage}
                        />

                        <Droppable droppableId={list.id} type="card">
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.droppableProps}
                              className={`min-h-[3rem] space-y-2 rounded-xl px-0.5 py-0.5 transition-colors ${
                                isV ? "" : "flex-1 overflow-y-auto"
                              }`}
                              style={
                                snap.isDraggingOver
                                  ? {
                                      background: "var(--primary-tint)",
                                      boxShadow:
                                        "inset 0 0 0 2px var(--primary)",
                                    }
                                  : undefined
                              }
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
                                      className={`cursor-pointer overflow-hidden rounded-[14px] border border-border bg-surface ${
                                        csnap.isDragging
                                          ? "rotate-1 shadow-lg"
                                          : ""
                                      }`}
                                      style={{
                                        ...cp.draggableProps.style,
                                        boxShadow: "var(--card-shadow)",
                                      }}
                                    >
                                      {card.color && (
                                        <div
                                          style={{ background: card.color }}
                                          className="h-[5px] w-full"
                                        />
                                      )}
                                      <div className="px-3 py-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                          <p className="text-[13.5px] font-medium leading-snug">
                                            {card.title}
                                          </p>
                                          {card.description && (
                                            <FileText
                                              size={14}
                                              className="mt-0.5 shrink-0 text-faint"
                                            />
                                          )}
                                        </div>
                                        {card.assignee_ids.length > 0 && (
                                          <div className="mt-2 flex justify-end">
                                            {card.assignee_ids
                                              .map((id) => membersById[id])
                                              .filter(Boolean)
                                              .slice(0, 4)
                                              .map((m, i) => (
                                                <span
                                                  key={m.id}
                                                  style={{
                                                    marginLeft: i ? -7 : 0,
                                                  }}
                                                >
                                                  <Avatar member={m} size={22} />
                                                </span>
                                              ))}
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

                        {canManage && (
                          <AddCard onAdd={() => addCardAndOpen(list.id)} />
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
              {canManage && <AddList onAdd={addList} vertical={isV} />}
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
          onAssign={(member) => {
            const me = getMyMemberId();
            if (member.id === me) return;
            sendNotification({
              title: "On t'a assigné une carte",
              body: editing.title,
              url: boardUrl,
              toMemberId: member.id,
              excludeMemberId: me,
            });
          }}
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
          canManage={canManage}
        />
      )}

      {showMembers && isAdmin && (
        <MembersModal
          members={members}
          onClose={() => setShowMembers(false)}
          onAdd={addMember}
          onDelete={removeMember}
        />
      )}

      {showNotif && (
        <NotifModal
          members={members}
          enabled={pushOn}
          onAddMember={addMember}
          onClose={() => setShowNotif(false)}
          onEnabled={() => setPushOn(true)}
          onDisabled={() => setPushOn(false)}
        />
      )}

      {showNotes && (
        <Sheet onClose={() => setShowNotes(false)}>
          <div className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 place-items-center rounded-xl"
              style={{ background: "rgba(240,180,41,.14)", color: "#D49A00" }}
            >
              <NotebookPen size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[17px] font-bold">Bloc-notes partagé</h2>
              <p className="truncate font-mono text-[10.5px] text-faint">
                {boardName} · visible en direct
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="grid h-8 w-8 place-items-center rounded-lg bg-inset text-muted"
              aria-label="Fermer"
            >
              <X size={17} />
            </button>
          </div>

          <textarea
            autoFocus
            value={noteText}
            onChange={(event) => changeNote(event.target.value)}
            placeholder="Idées, rappels, liens utiles…"
            rows={14}
            className="mt-4 w-full resize-none rounded-2xl border border-border bg-inset p-4 text-[14px] leading-6 text-text outline-none transition focus:border-primary placeholder:text-faint"
          />

          <div className="mt-2 flex items-center justify-between px-1 font-mono text-[10.5px] text-faint">
            <span className="flex items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  noteState === "saving" ? "animate-pulse" : ""
                }`}
                style={{
                  background:
                    noteState === "saving"
                      ? "#F0B429"
                      : noteState === "error"
                        ? "#E64980"
                        : "#0CA678",
                }}
              />
              {noteState === "saving"
                ? "Enregistrement…"
                : noteState === "error"
                  ? "Échec de sauvegarde"
                  : "Synchronisé"}
            </span>
            <span>{noteText.length} caractères</span>
          </div>
        </Sheet>
      )}
    </main>
  );
}

/* ---------- sous-composants ---------- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-wider text-faint">
      {children}
    </p>
  );
}

function ListHeader({
  list,
  accent,
  count,
  dragHandleProps,
  onRename,
  onDelete,
  canManage,
}: {
  list: List;
  accent: string;
  count: number;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> | null | undefined;
  onRename: (name: string) => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(list.name);

  return (
    <div
      {...dragHandleProps}
      className="flex items-center justify-between gap-2 px-1 py-2"
    >
      {editing && canManage ? (
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
          className="w-full rounded-md border border-border bg-surface px-1 text-xs font-bold uppercase text-text"
        />
      ) : (
        <div
          onClick={() => canManage && setEditing(true)}
          className={`flex flex-1 items-center gap-2 ${canManage ? "cursor-text" : ""}`}
        >
          <span
            style={{ background: accent }}
            className="h-[9px] w-[9px] shrink-0 rounded-full"
          />
          <span className="truncate text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
            {list.name}
          </span>
          <span className="rounded-full bg-inset px-1.5 font-mono text-[11px] text-faint">
            {count}
          </span>
        </div>
      )}
      {canManage && <button
        onClick={onDelete}
        className="shrink-0 text-faint transition hover:text-danger"
        aria-label="Supprimer la colonne"
      >
        <Trash2 size={15} />
      </button>}
    </div>
  );
}

function AddCard({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      onClick={onAdd}
      className="flex items-center gap-1.5 px-1 py-2 text-left text-[13px] font-medium text-faint transition hover:text-primary"
    >
      <Plus size={16} />
      Ajouter une carte
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
        className={`${width} flex items-center gap-1.5 rounded-[14px] border border-dashed border-border px-3 py-2.5 text-left text-[13px] text-faint transition hover:text-primary`}
      >
        <Plus size={16} /> Ajouter une colonne
      </button>
    );
  }
  return (
    <div className={`${width} rounded-[14px] border border-border bg-surface p-2`}>
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
        className="w-full rounded-lg border border-border bg-inset p-2 text-sm text-text outline-none placeholder:text-faint"
      />
      <div className="mt-1.5 flex gap-2">
        <button
          onClick={() => {
            if (name.trim()) onAdd(name.trim());
            setName("");
            setOpen(false);
          }}
          className="rounded-lg px-3 py-1 text-sm font-medium text-white"
          style={{ background: "var(--primary)" }}
        >
          Ajouter
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-muted">
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
  onAssign,
  onMove,
  onClose,
  onChange,
  onDelete,
  canManage,
}: {
  card: Card;
  isNew: boolean;
  lists: List[];
  members: Member[];
  onAddMember: (name: string) => Promise<Member>;
  onAssign: (member: Member) => void;
  onMove: (listId: string) => void;
  onClose: () => void;
  onChange: (fields: Partial<Card>) => void;
  onDelete: () => void;
  canManage: boolean;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [newMember, setNewMember] = useState("");

  function toggleAssignee(member: Member) {
    const has = card.assignee_ids.includes(member.id);
    const next = has
      ? card.assignee_ids.filter((a) => a !== member.id)
      : [...card.assignee_ids, member.id];
    onChange({ assignee_ids: next });
    if (!has) onAssign(member);
  }

  async function quickAdd() {
    const n = newMember.trim();
    if (!n) return;
    setNewMember("");
    const m = await onAddMember(n);
    onChange({ assignee_ids: [...card.assignee_ids, m.id] });
    onAssign(m);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2">
        <input
          value={title}
          autoFocus={isNew}
          onFocus={(e) => {
            if (isNew) e.target.select();
          }}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => onChange({ title: title.trim() || "Nouvelle tâche" })}
          placeholder="Titre de la tâche"
          className="min-w-0 flex-1 bg-transparent text-[19px] font-bold tracking-[-0.02em] text-text outline-none placeholder:text-faint"
        />
        <button
          onClick={onClose}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg bg-inset text-muted"
        >
          <X size={18} />
        </button>
      </div>

      {/* Statut — segmented control */}
      <SectionLabel>Statut</SectionLabel>
      <div className="flex gap-1 rounded-xl bg-inset p-1">
        {lists.map((l) => {
          const active = card.list_id === l.id;
          return (
            <button
              key={l.id}
              onClick={() => onMove(l.id)}
              className="flex-1 rounded-lg py-2 text-[13px] font-medium transition"
              style={
                active
                  ? {
                      background: "var(--primary)",
                      color: "#fff",
                      boxShadow: "0 2px 6px rgba(91,87,242,.35)",
                    }
                  : { color: "var(--muted)" }
              }
            >
              {l.name}
            </button>
          );
        })}
      </div>

      {/* Étiquette */}
      <SectionLabel>Étiquette</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onChange({ color: null })}
          className="grid h-[27px] w-[27px] place-items-center rounded-lg border border-dashed border-border text-faint"
          title="Aucune"
        >
          <X size={14} />
        </button>
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange({ color: c })}
            style={{
              background: c,
              boxShadow:
                card.color === c
                  ? `0 0 0 2px var(--surface), 0 0 0 4px ${c}`
                  : undefined,
            }}
            className="h-[27px] w-[27px] rounded-lg"
          />
        ))}
      </div>

      {canManage && (
      <>
      {/* Assignés */}
      <SectionLabel>Assignés</SectionLabel>
      <div className="flex flex-wrap gap-2">
        {members.map((m) => {
          const on = card.assignee_ids.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggleAssignee(m)}
              className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px]"
              style={
                on
                  ? { background: rgba(m.color, 0.14), color: m.color }
                  : { background: "var(--inset)", color: "var(--muted)" }
              }
            >
              <span
                style={{ background: m.color }}
                className="grid h-[18px] w-[18px] place-items-center rounded-full text-[9px] font-semibold text-white"
              >
                {initials(m.name)}
              </span>
              {m.name}
              {on && <Check size={14} />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={newMember}
          onChange={(e) => setNewMember(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && quickAdd()}
          placeholder="Nouveau profil…"
          className="flex-1 rounded-lg border border-border bg-inset px-2.5 py-1.5 text-[13px] text-text outline-none placeholder:text-faint"
        />
        <button
          onClick={quickAdd}
          className="grid h-9 w-9 place-items-center rounded-lg text-white"
          style={{ background: "var(--primary)" }}
        >
          <Plus size={18} />
        </button>
      </div>
      </>
      )}

      {/* Notes */}
      <SectionLabel>Notes</SectionLabel>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => onChange({ description })}
        placeholder="Détails, liens…"
        rows={4}
        className="w-full resize-none rounded-xl border border-border bg-inset p-3 text-[12.5px] leading-relaxed text-text outline-none placeholder:text-faint"
      />

      {/* Pied */}
      <div className="mt-4 flex gap-2">
        {canManage && <button
          onClick={onDelete}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
          style={{
            background: "var(--danger-bg)",
            border: "1px solid var(--danger-border)",
            color: "var(--danger)",
          }}
          aria-label="Supprimer"
        >
          <Trash2 size={18} />
        </button>}
        <button
          onClick={onClose}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl font-semibold"
          style={{ background: "var(--solid)", color: "var(--solid-text)" }}
        >
          <Check size={18} /> Enregistrer
        </button>
      </div>
    </Sheet>
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
  const me = getMyMemberId();

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    await onAdd(n);
  }

  return (
    <Sheet onClose={onClose}>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: "var(--primary-tint)", color: "var(--primary)" }}
        >
          <Users size={18} />
        </span>
        <h2 className="text-[17px] font-bold">Profils</h2>
        <span className="font-mono text-[11px] text-faint">
          {members.length}
        </span>
      </div>

      <ul className="space-y-2">
        {members.length === 0 && (
          <li className="text-sm text-faint">Aucun profil pour l&apos;instant.</li>
        )}
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between rounded-[13px] border border-border p-2"
          >
            <span className="flex items-center gap-2.5">
              <Avatar member={m} size={32} />
              <span className="text-[13.5px] font-semibold">{m.name}</span>
              {m.id === me && (
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[10px]"
                  style={{
                    background: "var(--primary-tint)",
                    color: "var(--primary)",
                  }}
                >
                  Toi
                </span>
              )}
            </span>
            {m.id !== me && (
              <button
                onClick={() => onDelete(m.id)}
                className="text-faint transition hover:text-danger"
                aria-label="Supprimer le profil"
              >
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Nom de la personne…"
          className="flex-1 rounded-xl border border-border bg-inset px-3 py-2 text-sm text-text outline-none placeholder:text-faint"
        />
        <button
          onClick={add}
          className="grid h-10 w-10 place-items-center rounded-xl text-white"
          style={{ background: "var(--primary)" }}
        >
          <Plus size={18} />
        </button>
      </div>

      <button
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-inset py-2.5 text-sm font-medium text-muted"
      >
        Fermer
      </button>
    </Sheet>
  );
}

function NotifModal({
  members,
  enabled,
  onAddMember,
  onClose,
  onEnabled,
  onDisabled,
}: {
  members: Member[];
  enabled: boolean;
  onAddMember: (name: string) => Promise<Member>;
  onClose: () => void;
  onEnabled: () => void;
  onDisabled: () => void;
}) {
  const supported = isPushSupported();
  const [meId, setMeId] = useState<string | null>(getMyMemberId());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function activate() {
    let id = meId;
    if (!id && newName.trim()) {
      const m = await onAddMember(newName.trim());
      id = m.id;
      setMeId(id);
    }
    if (!id) {
      setMsg("Choisis d'abord qui tu es.");
      return;
    }
    setBusy(true);
    setMsg("");
    const res = await enablePush(id);
    setBusy(false);
    if (res === "ok") {
      onEnabled();
      setMsg("Notifications activées sur cet appareil.");
    } else if (res === "denied") {
      setMsg("Permission refusée. Autorise les notifications dans les réglages.");
    } else {
      setMsg("Non supporté ici. Sur iPhone, ajoute l'app à l'écran d'accueil.");
    }
  }

  async function deactivate() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    onDisabled();
    setMsg("Notifications désactivées sur cet appareil.");
  }

  async function onToggle() {
    if (busy) return;
    if (enabled) await deactivate();
    else await activate();
  }

  return (
    <Sheet onClose={onClose}>
      <span
        className="grid h-[54px] w-[54px] place-items-center rounded-2xl"
        style={{ background: "var(--primary-tint)", color: "var(--primary)" }}
      >
        <Bell size={26} />
      </span>
      <h2 className="mt-3 text-[19px] font-bold tracking-[-0.02em]">
        Notifications push
      </h2>
      <p className="mt-1 text-sm text-muted">
        Sois prévenu quand on t&apos;assigne une carte, qu&apos;une carte est
        créée ou passée en Terminé.
      </p>

      {supported && (
        <>
          <SectionLabel>Tu es qui ?</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => {
              const on = meId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMeId(m.id)}
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[13px]"
                  style={
                    on
                      ? { background: "var(--primary)", color: "#fff" }
                      : { background: "var(--inset)", color: "var(--muted)" }
                  }
                >
                  <span
                    style={{ background: m.color }}
                    className="grid h-[18px] w-[18px] place-items-center rounded-full text-[9px] font-semibold text-white"
                  >
                    {initials(m.name)}
                  </span>
                  {m.name}
                  {on && <Check size={14} />}
                </button>
              );
            })}
          </div>
          {members.length === 0 && (
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ton prénom…"
              className="mt-2 w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm text-text outline-none placeholder:text-faint"
            />
          )}

          <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-inset px-3 py-3">
            <div>
              <p className="text-sm font-medium">Sur cet appareil</p>
              <p className="font-mono text-[11px] text-faint">
                {enabled ? "activées" : "désactivées"}
              </p>
            </div>
            <button
              onClick={onToggle}
              disabled={busy}
              aria-label="Activer/désactiver"
              className="relative h-[27px] w-[46px] shrink-0 rounded-full transition"
              style={{ background: enabled ? "var(--primary)" : "var(--track)" }}
            >
              <span
                className="absolute top-[3px] h-[21px] w-[21px] rounded-full bg-white transition-all"
                style={{ left: enabled ? 22 : 3 }}
              />
            </button>
          </div>
        </>
      )}

      <div
        className="mt-4 flex gap-2 rounded-xl p-3"
        style={{ background: "rgba(240,180,41,.1)", color: "#C9A24A" }}
      >
        <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        <p className="text-[12.5px] leading-relaxed">
          Sur iPhone, ajoute d&apos;abord l&apos;app à l&apos;écran d&apos;accueil
          (Partager → « Sur l&apos;écran d&apos;accueil »), puis active depuis
          l&apos;app. iOS 16.4+.
        </p>
      </div>

      {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}

      <button
        onClick={onClose}
        className="mt-4 w-full rounded-xl bg-inset py-2.5 text-sm font-medium text-muted"
      >
        Fermer
      </button>
    </Sheet>
  );
}
