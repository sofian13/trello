"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  MapPin,
  Clock,
  Plus,
  X,
  Trash2,
  Bell,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchMembers,
  fetchLocations,
  createLocation,
  deleteLocation,
  fetchMeetings,
  createMeeting,
  deleteMeeting,
} from "@/lib/db";
import { sendNotification, getMyMemberId } from "@/lib/push";
import type { Member, Location, Meeting } from "@/lib/types";
import Avatar, { initials } from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MeetingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [showLocations, setShowLocations] = useState(false);

  const [title, setTitle] = useState("");
  const [locationId, setLocationId] = useState("");
  const [when, setWhen] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [newLoc, setNewLoc] = useState(false);
  const [locName, setLocName] = useState("");
  const [locAddr, setLocAddr] = useState("");

  async function loadAll() {
    const [mem, loc, mt] = await Promise.all([
      fetchMembers(),
      fetchLocations(),
      fetchMeetings(),
    ]);
    setMembers(mem);
    setLocations(loc);
    setMeetings(mt);
  }

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("meetings-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "members" }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const locById = useMemo(() => {
    const m: Record<string, Location> = {};
    for (const l of locations) m[l.id] = l;
    return m;
  }, [locations]);
  const memById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  const upcoming = meetings.filter((m) => new Date(m.starts_at) >= new Date());
  const past = meetings
    .filter((m) => new Date(m.starts_at) < new Date())
    .reverse();

  function togglePick(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function addLocation() {
    const n = locName.trim();
    if (!n) return;
    const l = await createLocation(n, locAddr.trim());
    setLocations((prev) => [...prev, l]);
    setLocationId(l.id);
    setLocName("");
    setLocAddr("");
    setNewLoc(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!when || picked.length === 0) return;
    const startsAt = new Date(when).toISOString();
    const m = await createMeeting({
      title: title.trim(),
      location_id: locationId || null,
      starts_at: startsAt,
      member_ids: picked,
    });
    setMeetings((prev) => [...prev, m]);

    const loc = locationId ? locById[locationId]?.name : "";
    sendNotification({
      title: "📅 Nouvelle réunion",
      body: `${title.trim() ? title.trim() + " · " : ""}${loc ? loc + " · " : ""}${fmt(startsAt)}`,
      url: "/meetings",
      toMemberIds: picked,
      excludeMemberId: getMyMemberId(),
    });

    setTitle("");
    setWhen("");
    setPicked([]);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette réunion ?")) return;
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    await deleteMeeting(id);
  }

  function renotify(m: Meeting) {
    const loc = m.location_id ? locById[m.location_id]?.name : "";
    sendNotification({
      title: "📅 Rappel réunion",
      body: `${m.title ? m.title + " · " : ""}${loc ? loc + " · " : ""}${fmt(m.starts_at)}`,
      url: "/meetings",
      toMemberIds: m.member_ids,
    });
    alert("Rappel envoyé aux participants.");
  }

  function MeetingCard({ m, dim }: { m: Meeting; dim?: boolean }) {
    const loc = m.location_id ? locById[m.location_id] : null;
    return (
      <li
        className={`rounded-[18px] border border-border bg-surface p-4 shadow-[var(--card-shadow)] ${
          dim ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{m.title || "Réunion"}</p>
            <p
              className="mt-1 flex items-center gap-1.5 text-sm capitalize"
              style={{ color: "var(--primary)" }}
            >
              <Clock size={15} /> {fmt(m.starts_at)}
            </p>
            {loc && (
              <p className="flex items-center gap-1.5 text-sm text-muted">
                <MapPin size={15} /> {loc.name}
                {loc.address ? ` — ${loc.address}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={() => remove(m.id)}
            className="shrink-0 text-faint transition hover:text-danger"
            aria-label="Supprimer"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex">
            {m.member_ids
              .map((id) => memById[id])
              .filter(Boolean)
              .map((mm, i) => (
                <span key={mm.id} style={{ marginLeft: i ? -7 : 0 }}>
                  <Avatar member={mm} size={24} />
                </span>
              ))}
          </div>
          {!dim && (
            <button
              onClick={() => renotify(m)}
              className="flex items-center gap-1.5 rounded-lg bg-inset px-2.5 py-1 text-xs text-muted transition hover:text-text"
            >
              <Bell size={13} /> Rappel
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="min-h-dvh bg-bg text-text">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Link
            href="/"
            className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-inset hover:text-text"
          >
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-[17px] font-bold tracking-[-0.02em]">Réunions</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            onClick={() => setShowLocations(true)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm text-muted transition hover:text-text"
          >
            <MapPin size={16} /> Lieux
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pb-10 sm:px-6">
        <form
          onSubmit={submit}
          className="mb-6 space-y-3 rounded-[18px] border border-border bg-surface p-4"
        >
          <h2 className="font-semibold">Planifier une réunion</h2>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex: Point hebdo)…"
            className="w-full rounded-xl border border-border bg-inset px-3 py-2.5 text-text outline-none placeholder:text-faint focus:border-primary"
          />

          {!newLoc ? (
            <div className="flex gap-2">
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-inset px-3 py-2.5 text-text outline-none focus:border-primary"
              >
                <option value="">Choisir un lieu…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewLoc(true)}
                className="flex items-center gap-1 rounded-xl border border-border bg-inset px-3 text-sm text-muted transition hover:text-text"
              >
                <Plus size={15} /> Lieu
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-inset p-3">
              <input
                autoFocus
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                placeholder="Nom du lieu (ex: Salle A)…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-faint"
              />
              <input
                value={locAddr}
                onChange={(e) => setLocAddr(e.target.value)}
                placeholder="Adresse / détails (optionnel)…"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-faint"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addLocation}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-white"
                  style={{ background: "var(--primary)" }}
                >
                  Créer le lieu
                </button>
                <button
                  type="button"
                  onClick={() => setNewLoc(false)}
                  className="text-sm text-muted"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-border bg-inset px-3 py-2.5 text-text outline-none focus:border-primary"
          />

          <div>
            <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-faint">
              Participants
            </p>
            <div className="flex flex-wrap gap-2">
              {members.length === 0 && (
                <span className="text-sm text-faint">
                  Crée d&apos;abord des profils (bouton Membres sur un tableau).
                </span>
              )}
              {members.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => togglePick(m.id)}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm"
                    style={
                      on
                        ? { background: m.color, color: "#fff" }
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
          </div>

          <button
            type="submit"
            disabled={!when || picked.length === 0}
            className="w-full rounded-xl py-3 font-semibold text-white disabled:opacity-40"
            style={{ background: "var(--primary)" }}
          >
            Créer & notifier les participants
          </button>
        </form>

        <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">
          À venir
        </h2>
        {upcoming.length === 0 ? (
          <p className="mb-6 text-faint">Aucune réunion planifiée.</p>
        ) : (
          <ul className="mb-6 space-y-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} m={m} />
            ))}
          </ul>
        )}

        {past.length > 0 && (
          <>
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-faint">
              Passées
            </h2>
            <ul className="space-y-3">
              {past.map((m) => (
                <MeetingCard key={m.id} m={m} dim />
              ))}
            </ul>
          </>
        )}
      </div>

      {showLocations && (
        <LocationsModal
          locations={locations}
          onClose={() => setShowLocations(false)}
          onAdd={async (n, a) => {
            const l = await createLocation(n, a);
            setLocations((prev) => [...prev, l]);
          }}
          onDelete={async (id) => {
            setLocations((prev) => prev.filter((l) => l.id !== id));
            await deleteLocation(id);
          }}
        />
      )}
    </main>
  );
}

function LocationsModal({
  locations,
  onClose,
  onAdd,
  onDelete,
}: {
  locations: Location[];
  onClose: () => void;
  onAdd: (name: string, address: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [addr, setAddr] = useState("");
  const kb = useKeyboardInset();

  async function add() {
    if (!name.trim()) return;
    await onAdd(name.trim(), addr.trim());
    setName("");
    setAddr("");
  }

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "var(--scrim)", paddingBottom: kb }}
      onClick={onClose}
    >
      <div
        className="anim-sheet max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-surface px-[18px] pb-[22px] pt-[10px] text-text"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-[38px] rounded-full bg-track" />
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl"
            style={{ background: "var(--primary-tint)", color: "var(--primary)" }}
          >
            <MapPin size={18} />
          </span>
          <h2 className="text-[17px] font-bold">Lieux</h2>
        </div>
        <ul className="space-y-2">
          {locations.length === 0 && (
            <li className="text-sm text-faint">Aucun lieu pour l&apos;instant.</li>
          )}
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-[13px] border border-border p-2.5"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.name}</span>
                {l.address && (
                  <span className="block truncate text-xs text-faint">
                    {l.address}
                  </span>
                )}
              </span>
              <button
                onClick={() => onDelete(l.id)}
                className="shrink-0 text-faint hover:text-danger"
                aria-label="Supprimer"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du lieu…"
            className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm outline-none placeholder:text-faint"
          />
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Adresse / détails (optionnel)…"
            className="w-full rounded-xl border border-border bg-inset px-3 py-2 text-sm outline-none placeholder:text-faint"
          />
          <button
            onClick={add}
            className="w-full rounded-xl py-2.5 text-sm font-medium text-white"
            style={{ background: "var(--primary)" }}
          >
            Ajouter le lieu
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-inset py-2.5 text-sm font-medium text-muted"
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
