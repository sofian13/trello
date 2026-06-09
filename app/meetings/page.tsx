"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

function Avatar({ member, size = 26 }: { member: Member; size?: number }) {
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

  // formulaire
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

    // Notif aux participants
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
    alert("Rappel envoyé aux participants 🔔");
  }

  function MeetingCard({ m, dim }: { m: Meeting; dim?: boolean }) {
    const loc = m.location_id ? locById[m.location_id] : null;
    return (
      <li
        className={`rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-sm ${
          dim ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-base font-semibold">
              {m.title || "Réunion"}
            </p>
            <p className="mt-1 text-sm capitalize text-sky-200">
              🕒 {fmt(m.starts_at)}
            </p>
            {loc && (
              <p className="text-sm text-white/70">
                📍 {loc.name}
                {loc.address ? ` — ${loc.address}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={() => remove(m.id)}
            className="shrink-0 rounded-lg p-1 text-white/40 transition hover:bg-white/10 hover:text-red-400"
            aria-label="Supprimer"
          >
            ✕
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex -space-x-2">
            {m.member_ids
              .map((id) => memById[id])
              .filter(Boolean)
              .map((mm) => (
                <Avatar key={mm.id} member={mm} />
              ))}
          </div>
          {!dim && (
            <button
              onClick={() => renotify(m)}
              className="rounded-lg bg-white/10 px-2.5 py-1 text-xs text-white/80 transition hover:bg-white/20"
            >
              🔔 Rappel
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-lg transition hover:bg-white/20"
          >
            ←
          </Link>
          <h1 className="text-lg font-semibold tracking-tight">📅 Réunions</h1>
        </div>
        <button
          onClick={() => setShowLocations(true)}
          className="rounded-xl bg-white/10 px-3 py-1.5 text-sm transition hover:bg-white/20"
        >
          📍 Lieux
        </button>
      </header>

      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        {/* Formulaire */}
        <form
          onSubmit={submit}
          className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4"
        >
          <h2 className="font-semibold">Planifier une réunion</h2>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex: Point hebdo)…"
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white placeholder:text-white/40 outline-none focus:border-sky-400/60"
          />

          {/* Lieu */}
          {!newLoc ? (
            <div className="flex gap-2">
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400/60 [&>option]:text-slate-800"
              >
                <option value="">📍 Choisir un lieu…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewLoc(true)}
                className="rounded-xl bg-white/10 px-3 text-sm transition hover:bg-white/20"
              >
                + Lieu
              </button>
            </div>
          ) : (
            <div className="space-y-2 rounded-xl bg-white/5 p-3">
              <input
                autoFocus
                value={locName}
                onChange={(e) => setLocName(e.target.value)}
                placeholder="Nom du lieu (ex: Salle A)…"
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <input
                value={locAddr}
                onChange={(e) => setLocAddr(e.target.value)}
                placeholder="Adresse / détails (optionnel)…"
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addLocation}
                  className="rounded-lg bg-sky-600 px-3 py-1 text-sm hover:bg-sky-700"
                >
                  Créer le lieu
                </button>
                <button
                  type="button"
                  onClick={() => setNewLoc(false)}
                  className="text-sm text-white/60"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Date / heure */}
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white outline-none focus:border-sky-400/60 [color-scheme:dark]"
          />

          {/* Participants */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-white/50">
              Participants
            </p>
            <div className="flex flex-wrap gap-2">
              {members.length === 0 && (
                <span className="text-sm text-white/40">
                  Crée d&apos;abord des profils (bouton 👥 sur un tableau).
                </span>
              )}
              {members.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => togglePick(m.id)}
                    style={
                      on
                        ? { background: m.color, color: "white", borderColor: m.color }
                        : { borderColor: m.color, color: "white" }
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
          </div>

          <button
            type="submit"
            disabled={!when || picked.length === 0}
            className="w-full rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 py-2.5 font-medium text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
          >
            Créer & notifier les participants
          </button>
        </form>

        {/* À venir */}
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
          À venir
        </h2>
        {upcoming.length === 0 ? (
          <p className="mb-6 text-white/40">Aucune réunion planifiée.</p>
        ) : (
          <ul className="mb-6 space-y-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} m={m} />
            ))}
          </ul>
        )}

        {/* Passées */}
        {past.length > 0 && (
          <>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-white/50">
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

  async function add() {
    if (!name.trim()) return;
    await onAdd(name.trim(), addr.trim());
    setName("");
    setAddr("");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-4 text-slate-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold">📍 Lieux</h2>
        <ul className="space-y-2">
          {locations.length === 0 && (
            <li className="text-sm text-slate-400">Aucun lieu pour l&apos;instant.</li>
          )}
          {locations.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{l.name}</span>
                {l.address && (
                  <span className="block truncate text-xs text-slate-400">
                    {l.address}
                  </span>
                )}
              </span>
              <button
                onClick={() => onDelete(l.id)}
                className="shrink-0 text-slate-400 hover:text-red-500"
                aria-label="Supprimer"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du lieu…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
          />
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Adresse / détails (optionnel)…"
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-sky-400"
          />
          <button
            onClick={add}
            className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Ajouter le lieu
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
