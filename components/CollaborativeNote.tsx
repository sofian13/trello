"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { createBoardNote, updateCard } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import {
  decodeNoteDocument,
  decodeYjsUpdate,
  encodeNoteDocument,
  encodeYjsUpdate,
  noteTextFromStorage,
} from "@/lib/yjs-note";
import type { Card, Member } from "@/lib/types";

const REMOTE_ORIGIN = Symbol("remote-note-update");

type Props = {
  boardId: string;
  initialNote: Card | null;
  listId?: string;
  member?: Member;
  onNoteReady: (note: Card) => void;
  onTextChange: (text: string) => void;
};

export default function CollaborativeNote({
  boardId,
  initialNote,
  listId,
  member,
  onNoteReady,
  onTextChange,
}: Props) {
  const [text, setText] = useState(() =>
    noteTextFromStorage(initialNote?.description ?? "")
  );
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">(
    "saved"
  );
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
  const docRef = useRef<Y.Doc | null>(null);
  const noteRef = useRef<Card | null>(initialNote);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createPromise = useRef<Promise<Card> | null>(null);

  useEffect(() => {
    const doc = decodeNoteDocument(initialNote?.description ?? "");
    const sharedText = doc.getText("content");
    docRef.current = doc;
    noteRef.current = initialNote;
    queueMicrotask(() => onTextChange(sharedText.toString()));

    const channel = supabase.channel(`collaborative-note:${boardId}`, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: member?.id ?? crypto.randomUUID() },
      },
    });

    async function ensureNote(): Promise<Card | null> {
      if (noteRef.current) return noteRef.current;
      if (!listId) return null;
      createPromise.current ??= createBoardNote(listId);
      const note = await createPromise.current;
      noteRef.current = note;
      onNoteReady(note);
      return note;
    }

    async function persist() {
      try {
        const snapshot = encodeNoteDocument(doc);
        const note = await ensureNote();
        if (!note) return;
        await updateCard(note.id, { description: snapshot });
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }

    function schedulePersist() {
      setSaveState("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 300);
    }

    function refreshPresence() {
      const names = Object.values(channel.presenceState())
        .flat()
        .map((presence) => {
          const data = presence as { name?: string };
          return String(data.name ?? "Collègue");
        });
      setOnlineNames([...new Set(names)]);
    }

    const onTextUpdate = () => {
      const nextText = sharedText.toString();
      setText(nextText);
      onTextChange(nextText);
    };

    const onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== REMOTE_ORIGIN) {
        void channel.send({
          type: "broadcast",
          event: "yjs-update",
          payload: { update: encodeYjsUpdate(update) },
        });
      }
      schedulePersist();
    };

    sharedText.observe(onTextUpdate);
    doc.on("update", onDocumentUpdate);

    channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        if (typeof payload?.update === "string") {
          Y.applyUpdate(doc, decodeYjsUpdate(payload.update), REMOTE_ORIGIN);
        }
      })
      .on("broadcast", { event: "yjs-sync-request" }, () => {
        void channel.send({
          type: "broadcast",
          event: "yjs-update",
          payload: { update: encodeYjsUpdate(Y.encodeStateAsUpdate(doc)) },
        });
      })
      .on("presence", { event: "sync" }, refreshPresence)
      .on("presence", { event: "join" }, refreshPresence)
      .on("presence", { event: "leave" }, refreshPresence)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          id: member?.id ?? "anonymous",
          name: member?.name ?? "Collègue",
          color: member?.color ?? "#64748B",
        });
        await channel.send({
          type: "broadcast",
          event: "yjs-sync-request",
          payload: {},
        });
      });

    if (initialNote && !initialNote.description.startsWith("yjs:v1:")) {
      queueMicrotask(schedulePersist);
    }

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void persist();
      }
      sharedText.unobserve(onTextUpdate);
      doc.off("update", onDocumentUpdate);
      void channel.untrack();
      void supabase.removeChannel(channel);
      doc.destroy();
      docRef.current = null;
    };
    // Le document reste stable pendant l'ouverture du panneau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, listId, member?.id]);

  function changeText(nextText: string) {
    const doc = docRef.current;
    if (!doc) return;
    const sharedText = doc.getText("content");
    const current = sharedText.toString();

    let prefix = 0;
    while (
      prefix < current.length &&
      prefix < nextText.length &&
      current[prefix] === nextText[prefix]
    ) {
      prefix++;
    }

    let suffix = 0;
    while (
      suffix < current.length - prefix &&
      suffix < nextText.length - prefix &&
      current[current.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]
    ) {
      suffix++;
    }

    doc.transact(() => {
      const deleteLength = current.length - prefix - suffix;
      if (deleteLength) sharedText.delete(prefix, deleteLength);
      const inserted = nextText.slice(prefix, nextText.length - suffix);
      if (inserted) sharedText.insert(prefix, inserted);
    });
  }

  const otherNames = onlineNames.filter((name) => name !== member?.name);

  return (
    <>
      <textarea
        autoFocus
        value={text}
        onChange={(event) => changeText(event.target.value)}
        placeholder="Idées, rappels, liens utiles…"
        rows={14}
        className="mt-4 w-full resize-none rounded-2xl border border-border bg-inset p-4 text-[14px] leading-6 text-text outline-none transition focus:border-primary placeholder:text-faint"
      />

      <div className="mt-2 flex items-center justify-between gap-3 px-1 font-mono text-[10.5px] text-faint">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              saveState === "saving" ? "animate-pulse" : ""
            }`}
            style={{
              background:
                saveState === "saving"
                  ? "#F0B429"
                  : saveState === "error"
                    ? "#E64980"
                    : "#0CA678",
            }}
          />
          <span className="truncate">
            {saveState === "saving"
              ? "Synchronisation…"
              : saveState === "error"
                ? "Échec de sauvegarde"
                : otherNames.length
                  ? `${otherNames.join(", ")} en ligne`
                  : "Synchronisé"}
          </span>
        </span>
        <span className="shrink-0">{text.length} caractères</span>
      </div>
    </>
  );
}
