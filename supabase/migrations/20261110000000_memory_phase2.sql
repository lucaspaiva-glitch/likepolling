-- Memory, phase 2: two more collections for the reports. Adds tables and write functions only.
--   trends_daily        Google Trends "trending now" searches per country (public RSS feed), kept per
--                       UTC day with the highest approximate traffic seen. Filled every 2 hours by
--                       scripts/trends-routine.js. No news headlines are stored.
--   holidays            Public holidays per country this year and next (Nager.Date, open source).
--                       Filled weekly by scripts/holidays-routine.js.

create table if not exists public.trends_daily (
  day           date        not null,
  country_code  text        not null check (country_code ~ '^[A-Z]{2}$'),
  query         text        not null check (length(query) between 1 and 200),
  traffic       integer,
  started_at    timestamptz,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  primary key (day, country_code, query)
);
create index if not exists trends_daily_cc_day on public.trends_daily (country_code, day desc);

create table if not exists public.holidays (
  country_code  text not null check (country_code ~ '^[A-Z]{2}$'),
  day           date not null,
  local_name    text not null,
  name          text not null,
  primary key (country_code, day, name)
);

-- Adds new trending searches and keeps the highest traffic seen for ones already saved that day.
create or replace function public.upsert_trends_daily(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.trends_daily as t (day, country_code, query, traffic, started_at, first_seen, last_seen)
  select r.day, r.country_code, r.query, r.traffic, r.started_at, now(), now()
    from jsonb_to_recordset(payload) as r(day date, country_code text, query text, traffic integer, started_at timestamptz)
  on conflict (day, country_code, query) do update
    set traffic = greatest(t.traffic, excluded.traffic), last_seen = now(), started_at = coalesce(t.started_at, excluded.started_at);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Replaces, in one transaction, every (country, year) present in the payload.
create or replace function public.replace_holidays(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.holidays t
   using (select distinct e->>'country_code' as cc, extract(year from (e->>'day')::date) as y from jsonb_array_elements(payload) e) p
   where t.country_code = p.cc and extract(year from t.day) = p.y;
  insert into public.holidays (country_code, day, local_name, name)
  select distinct on (r.country_code, r.day, r.name) r.country_code, r.day, r.local_name, r.name
    from jsonb_to_recordset(payload) as r(country_code text, day date, local_name text, name text);
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['trends_daily', 'holidays'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read access" on public.%I', t);
    execute format('create policy "Public read access" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.upsert_trends_daily(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_holidays(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_trends_daily(jsonb) to service_role;
grant execute on function public.replace_holidays(jsonb) to service_role;
