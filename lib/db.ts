import { supabase } from "./supabase";
import type { Board, List, Card, Member } from "./types";

// ---- Boards ----
export async function fetchBoards(): Promise<Board[]> {
  const { data, error } = await supabase
    .from("boards")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createBoard(name: string): Promise<Board> {
  const { data, error } = await supabase
    .from("boards")
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Crée un tableau avec ses 3 colonnes par défaut (À faire / En cours / Terminé).
export const DEFAULT_COLUMNS = ["À faire", "En cours", "Terminé"];

export async function createBoardWithDefaults(name: string): Promise<Board> {
  const board = await createBoard(name);
  await Promise.all(
    DEFAULT_COLUMNS.map((n, i) => createList(board.id, n, i))
  );
  return board;
}

export async function renameBoard(id: string, name: string) {
  const { error } = await supabase.from("boards").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteBoard(id: string) {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw error;
}

// ---- Lists ----
export async function fetchLists(boardId: string): Promise<List[]> {
  const { data, error } = await supabase
    .from("lists")
    .select("*")
    .eq("board_id", boardId)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createList(boardId: string, name: string, position: number) {
  const { data, error } = await supabase
    .from("lists")
    .insert({ board_id: boardId, name, position })
    .select()
    .single();
  if (error) throw error;
  return data as List;
}

export async function renameList(id: string, name: string) {
  const { error } = await supabase.from("lists").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function updateListPosition(id: string, position: number) {
  const { error } = await supabase.from("lists").update({ position }).eq("id", id);
  if (error) throw error;
}

export async function deleteList(id: string) {
  const { error } = await supabase.from("lists").delete().eq("id", id);
  if (error) throw error;
}

// ---- Cards ----
export async function fetchCards(boardListIds: string[]): Promise<Card[]> {
  if (boardListIds.length === 0) return [];
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .in("list_id", boardListIds)
    .order("position", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCard(listId: string, title: string, position: number) {
  const { data, error } = await supabase
    .from("cards")
    .insert({ list_id: listId, title, position })
    .select()
    .single();
  if (error) throw error;
  return data as Card;
}

export async function updateCard(
  id: string,
  fields: Partial<
    Pick<
      Card,
      | "title"
      | "description"
      | "list_id"
      | "position"
      | "color"
      | "status"
      | "assignee_ids"
    >
  >
) {
  const { error } = await supabase.from("cards").update(fields).eq("id", id);
  if (error) throw error;
}

export async function deleteCard(id: string) {
  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) throw error;
}

// ---- Members (profils) ----
export async function fetchMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createMember(name: string, color: string): Promise<Member> {
  const { data, error } = await supabase
    .from("members")
    .insert({ name, color })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMember(id: string) {
  const { error } = await supabase.from("members").delete().eq("id", id);
  if (error) throw error;
}
