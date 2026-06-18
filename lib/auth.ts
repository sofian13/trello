export const MEMBER_COOKIE = "tb_member";

const CORE_MEMBER_NAMES = new Set(["soso", "pablo", "moha"]);
const SORA_CARD_MEMBER_NAMES = new Set(["soso", "rayan"]);

export function normalizeMemberName(name: string): string {
  return name.trim().toLocaleLowerCase("fr");
}

export function isCoreMember(name: string | null | undefined): boolean {
  return !!name && CORE_MEMBER_NAMES.has(normalizeMemberName(name));
}

export function canAccessBoard(
  memberName: string | null | undefined,
  boardName: string
): boolean {
  if (!memberName) return false;
  const member = normalizeMemberName(memberName);
  const board = boardName.trim().toLocaleLowerCase("fr");

  if (board === "sora card") return SORA_CARD_MEMBER_NAMES.has(member);
  return CORE_MEMBER_NAMES.has(member);
}
