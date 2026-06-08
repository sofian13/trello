-- TeamBoard — schéma Supabase (idempotent, ré-exécutable)

create extension if not exists "pgcrypto";

create table if not exists boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists lists (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  name text not null,
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  title text not null,
  description text not null default '',
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lists_board_idx on lists(board_id);
create index if not exists cards_list_idx on cards(list_id);

-- Realtime (ignore si déjà ajouté)
do $$ begin
  alter publication supabase_realtime add table boards;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table lists;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table cards;
exception when duplicate_object then null; end $$;

-- RLS : accès via la clé anon (l'app est protégée par un mot de passe d'équipe).
alter table boards enable row level security;
alter table lists  enable row level security;
alter table cards  enable row level security;

drop policy if exists "anon_all_boards" on boards;
drop policy if exists "anon_all_lists"  on lists;
drop policy if exists "anon_all_cards"  on cards;

create policy "anon_all_boards" on boards for all using (true) with check (true);
create policy "anon_all_lists"  on lists  for all using (true) with check (true);
create policy "anon_all_cards"  on cards  for all using (true) with check (true);
