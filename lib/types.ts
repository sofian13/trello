export type Board = {
  id: string;
  name: string;
  created_at: string;
};

export type List = {
  id: string;
  board_id: string;
  name: string;
  position: number;
  created_at: string;
};

export type CardStatus =
  | "none"
  | "todo"
  | "in_progress"
  | "done"
  | "note";

export type Card = {
  id: string;
  list_id: string;
  title: string;
  description: string;
  position: number;
  color: string | null;
  status: CardStatus;
  assignee_ids: string[];
  created_at: string;
};

export type Member = {
  id: string;
  name: string;
  color: string;
  created_at: string;
};

export type Location = {
  id: string;
  name: string;
  address: string;
  created_at: string;
};

export type Meeting = {
  id: string;
  title: string;
  location_id: string | null;
  starts_at: string;
  member_ids: string[];
  created_at: string;
};
