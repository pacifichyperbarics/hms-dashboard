-- Run this in the Supabase SQL editor (supabase.com → your project → SQL Editor)

-- 1. Create table
create table if not exists dashboard_data (
  id integer primary key default 1,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- 2. Enforce single row
alter table dashboard_data drop constraint if exists single_row;
alter table dashboard_data add constraint single_row check (id = 1);

-- 3. Enable Row Level Security
alter table dashboard_data enable row level security;

-- 4. Allow reads and writes (no auth required — internal tool)
drop policy if exists "allow_all" on dashboard_data;
create policy "allow_all" on dashboard_data for all using (true) with check (true);
