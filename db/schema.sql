-- db/schema.sql
-- Canon del esquema LIWA + RLS (multi-org)

-- Extensiones
create extension if not exists "pgcrypto";

-- =========================
-- Tablas núcleo
-- =========================

create table if not exists orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists org_members (
  org_id uuid not null references orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('admin','member')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists machines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  line_id uuid not null references lines(id) on delete cascade,
  code text not null,
  name text not null,
  ideal_cycle_ms int,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  lvl1 text,
  lvl2 text,
  lvl3 text,
  classified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists production (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  machine_id uuid not null references machines(id) on delete cascade,
  shift_id uuid not null references shifts(id) on delete set null,
  good_units int not null default 0,
  bad_units int not null default 0,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists downtime_taxonomy (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  lvl1 text not null,
  lvl2 text,
  lvl3 text,
  requires_lvl3 boolean not null default false,
  created_at timestamptz not null default now()
);

-- Índices útiles
create index if not exists idx_lines_org on lines(org_id);
create index if not exists idx_machines_org on machines(org_id);
create index if not exists idx_machines_line on machines(line_id);
create index if not exists idx_shifts_org on shifts(org_id);
create index if not exists idx_events_org on events(org_id);
create index if not exists idx_events_machine on events(machine_id);
create index if not exists idx_events_shift on events(shift_id);
create index if not exists idx_events_started_at on events(started_at);
create index if not exists idx_production_org on production(org_id);
create index if not exists idx_production_machine on production(machine_id);
create index if not exists idx_production_shift on production(shift_id);
create index if not exists idx_production_recorded_at on production(recorded_at);
create index if not exists idx_taxonomy_org on downtime_taxonomy(org_id);

-- =========================
-- Helper de seguridad
-- =========================
create or replace function is_member(p_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from org_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
  );
$$;

-- =========================
-- RLS
-- =========================
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table lines enable row level security;
alter table machines enable row level security;
alter table shifts enable row level security;
alter table events enable row level security;
alter table production enable row level security;
alter table downtime_taxonomy enable row level security;

-- Políticas por tabla (SELECT/INSERT/UPDATE/DELETE)
create policy orgs_select on orgs
  for select using (is_member(id));

create policy org_members_all on org_members
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy lines_all on lines
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy machines_all on machines
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy shifts_all on shifts
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy events_all on events
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy production_all on production
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy taxonomy_all on downtime_taxonomy
  for all using (is_member(org_id)) with check (is_member(org_id));

-- =========================
-- Vista base: pendientes
-- =========================
create or replace view v_pending_events as
select
  e.id,
  e.org_id,
  l.code as line_code,
  m.code as machine_code,
  e.shift_id,
  e.started_at,
  e.ended_at,
  e.lvl1, e.lvl2, e.lvl3,
  e.classified
from events e
join machines m on m.id = e.machine_id
join lines l on l.id = m.line_id
where (not e.classified) or (e.lvl1 = 'Sin Clasificar');

