-- Fashion Share: the 14 biggest fashion YouTube channels, per upload year: how many videos they posted and
-- how many views those videos have today. Saved weekly by scripts/fashion-yearly-routine.js.
create table if not exists public.fashion_channel_yearly (
  channel_id text not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  year       int not null check (year between 2005 and 2100),
  name       text not null,
  videos     int not null,
  views      bigint not null,
  saved_at   timestamptz not null default now(),
  primary key (channel_id, year)
);
alter table public.fashion_channel_yearly enable row level security;
drop policy if exists "Public read access" on public.fashion_channel_yearly;
create policy "Public read access" on public.fashion_channel_yearly for select to anon, authenticated using (true);
grant select on public.fashion_channel_yearly to anon, authenticated;
grant all on public.fashion_channel_yearly to service_role;
