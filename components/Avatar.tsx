import type { Member } from "@/lib/types";

export function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

export default function Avatar({
  member,
  size = 23,
}: {
  member: Member;
  size?: number;
}) {
  return (
    <span
      title={member.name}
      style={{ background: member.color, width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-surface text-[10px] font-semibold text-white"
    >
      {initials(member.name)}
    </span>
  );
}
