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

-- Profils (membres de l'équipe)
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#0284c7',
  created_at timestamptz not null default now()
);

-- Lieux de réunion (créés à l'avance, puis sélectionnés)
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  created_at timestamptz not null default now()
);

-- Réunions planifiées
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  location_id uuid references locations(id) on delete set null,
  starts_at timestamptz not null,
  member_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Abonnements aux notifications push (un par appareil)
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  subscription jsonb not null,
  member_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Nouvelles propriétés des cartes : couleur, statut, personnes assignées
alter table cards add column if not exists color text;
alter table cards add column if not exists status text not null default 'none';
alter table cards add column if not exists assignee_ids uuid[] not null default '{}';

create index if not exists lists_board_idx on lists(board_id);
create index if not exists cards_list_idx on cards(list_id);

-- Realtime (ignore si déjà ajouté)
do $$ begin alter publication supabase_realtime add table boards;  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table lists;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table cards;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table members;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table locations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table meetings;  exception when duplicate_object then null; end $$;

-- RLS : accès via la clé anon/publishable (l'app est protégée par un mot de passe d'équipe).
alter table boards  enable row level security;
alter table lists   enable row level security;
alter table cards   enable row level security;
alter table members enable row level security;
alter table push_subscriptions enable row level security;
alter table locations enable row level security;
alter table meetings  enable row level security;

drop policy if exists "anon_all_boards"    on boards;
drop policy if exists "anon_all_lists"     on lists;
drop policy if exists "anon_all_cards"     on cards;
drop policy if exists "anon_all_members"   on members;
drop policy if exists "anon_all_push"      on push_subscriptions;
drop policy if exists "anon_all_locations" on locations;
drop policy if exists "anon_all_meetings"  on meetings;

create policy "anon_all_boards"    on boards  for all using (true) with check (true);
create policy "anon_all_lists"     on lists   for all using (true) with check (true);
create policy "anon_all_cards"     on cards   for all using (true) with check (true);
create policy "anon_all_members"   on members for all using (true) with check (true);
create policy "anon_all_push"      on push_subscriptions for all using (true) with check (true);
create policy "anon_all_locations" on locations for all using (true) with check (true);
create policy "anon_all_meetings"  on meetings  for all using (true) with check (true);
