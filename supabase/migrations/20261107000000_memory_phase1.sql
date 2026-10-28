-- Memory, phase 1: three new daily collections, kept for the long term. Adds tables and write
-- functions only; no existing table, function, policy or page is changed.
--   wiki_top_daily       Wikipedia's most-read articles per country per day (Wikimedia top-per-country,
--                        public domain), up to 100 per country. Filled by scripts/wiki-routine.js.
--   gdelt_country_daily  News events per country (where they happened) and CAMEO topic (2-digit root
--                        code), with the number of articles. Source: The GDELT Project (free, credit
--                        required). Filled by scripts/gdelt-routine.js.
--   gdelt_pairs_daily    News events between two tracked countries (actor 1 -> actor 2).
--   search_counts_daily  Anonymous count of channel lookups on likepolling.com per visitor country
--                        per day. Only the channel ID and the country from Vercel's geo header are
--                        kept: no IP, no user data. Written by api/search-count.js.

create table if not exists public.wiki_top_daily (
  day           date        not null,
  country_code  text        not null check (country_code ~ '^[A-Z]{2}$'),
  rank          smallint    not null check (rank between 1 and 100),
  project       text        not null,
  article       text        not null,
  views_ceil    integer,
  fetched_at    timestamptz not null default now(),
  primary key (day, country_code, rank)
);
create index if not exists wiki_top_daily_cc_day on public.wiki_top_daily (country_code, day desc);

create table if not exists public.gdelt_country_daily (
  day           date     not null,
  country_code  text     not null check (country_code ~ '^[A-Z]{2}$'),
  root_code     text     not null check (root_code ~ '^[0-9]{2}$'),
  events        integer  not null,
  articles      integer  not null,
  primary key (day, country_code, root_code)
);
create index if not exists gdelt_country_daily_cc_day on public.gdelt_country_daily (country_code, day desc);

create table if not exists public.gdelt_pairs_daily (
  day        date     not null,
  actor1_cc  text     not null check (actor1_cc ~ '^[A-Z]{2}$'),
  actor2_cc  text     not null check (actor2_cc ~ '^[A-Z]{2}$'),
  events     integer  not null,
  articles   integer  not null,
  primary key (day, actor1_cc, actor2_cc)
);
create index if not exists gdelt_pairs_daily_a2_day on public.gdelt_pairs_daily (actor2_cc, day desc);

create table if not exists public.search_counts_daily (
  day           date     not null default ((now() at time zone 'utc')::date),
  country_code  text     not null check (country_code ~ '^[A-Z]{2}$'),
  channel_id    text     not null check (channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
  searches      integer  not null default 0,
  primary key (day, country_code, channel_id)
);
create index if not exists search_counts_daily_cc_day on public.search_counts_daily (country_code, day desc);

-- Replaces, in one transaction, every (day, country) present in the payload; others are untouched.
create or replace function public.replace_wiki_top_daily(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.wiki_top_daily t
   using (select distinct (e->>'day')::date as day, e->>'country_code' as cc from jsonb_array_elements(payload) e) p
   where t.day = p.day and t.country_code = p.cc;
  insert into public.wiki_top_daily (day, country_code, rank, project, article, views_ceil, fetched_at)
  select r.day, r.country_code, r.rank, r.project, r.article, r.views_ceil, now()
    from jsonb_to_recordset(payload) as r(day date, country_code text, rank smallint, project text, article text, views_ceil integer);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Replaces, in one transaction, the GDELT rows of every day present in either payload.
create or replace function public.replace_gdelt_daily(countries jsonb, pairs jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
  m integer;
begin
  delete from public.gdelt_country_daily t
   where t.day in (select distinct (e->>'day')::date from jsonb_array_elements(countries || pairs) e);
  delete from public.gdelt_pairs_daily t
   where t.day in (select distinct (e->>'day')::date from jsonb_array_elements(countries || pairs) e);
  insert into public.gdelt_country_daily (day, country_code, root_code, events, articles)
  select r.day, r.country_code, r.root_code, r.events, r.articles
    from jsonb_to_recordset(countries) as r(day date, country_code text, root_code text, events integer, articles integer);
  get diagnostics n = row_count;
  insert into public.gdelt_pairs_daily (day, actor1_cc, actor2_cc, events, articles)
  select r.day, r.actor1_cc, r.actor2_cc, r.events, r.articles
    from jsonb_to_recordset(pairs) as r(day date, actor1_cc text, actor2_cc text, events integer, articles integer);
  get diagnostics m = row_count;
  return n + m;
end;
$$;

-- Adds one lookup for today (UTC). Only channels already in public.entities are counted, so
-- random IDs can't be written. Returns the new count, or 0 when the channel is unknown.
create or replace function public.bump_search_count(p_country text, p_channel text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.entities e where e.handles->>'youtube_channel_id' = p_channel) then
    return 0;
  end if;
  insert into public.search_counts_daily as s (day, country_code, channel_id, searches)
  values ((now() at time zone 'utc')::date, p_country, p_channel, 1)
  on conflict (day, country_code, channel_id) do update set searches = s.searches + 1
  returning s.searches into n;
  return n;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['wiki_top_daily', 'gdelt_country_daily', 'gdelt_pairs_daily', 'search_counts_daily'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read access" on public.%I', t);
    execute format('create policy "Public read access" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.replace_wiki_top_daily(jsonb) from public, anon, authenticated;
revoke execute on function public.replace_gdelt_daily(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.bump_search_count(text, text) from public, anon, authenticated;
grant execute on function public.replace_wiki_top_daily(jsonb) to service_role;
grant execute on function public.replace_gdelt_daily(jsonb, jsonb) to service_role;
grant execute on function public.bump_search_count(text, text) to service_role;
