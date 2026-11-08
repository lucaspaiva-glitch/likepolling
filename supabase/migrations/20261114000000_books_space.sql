-- Memory: trending books (Open Library) and spaceflight (Launch Library 2 + Spaceflight News, The Space Devs).
--   books_daily     Open Library's weekly trending books, saved once a day (top 20). Worldwide, not per country.
--   space_launches  Upcoming and past rocket launches, with the launch site's country. Kept as history.
--   space_news      Spaceflight headlines: title, link and site only.
-- Filled daily by scripts/books-routine.js and scripts/space-routine.js. Public read.
create table if not exists public.books_daily (
  day           date not null,
  rank          smallint not null check (rank between 1 and 50),
  work_key      text not null,
  title         text not null,
  author        text,
  cover_id      integer,
  first_year    smallint,
  primary key (day, rank)
);

create table if not exists public.space_launches (
  id            text primary key,
  name          text not null,
  net           timestamptz not null,
  status        text,
  provider      text,
  country_code  text check (country_code ~ '^[A-Z]{2}$'),
  site          text,
  mission       text,
  updated_at    timestamptz not null default now()
);
create index if not exists space_launches_cc_net on public.space_launches (country_code, net);

create table if not exists public.space_news (
  id            integer primary key,
  title         text not null,
  url           text not null,
  site          text,
  published_at  timestamptz not null
);
create index if not exists space_news_published on public.space_news (published_at desc);

create or replace function public.replace_books_daily(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  delete from public.books_daily t using (select distinct (e->>'day')::date d from jsonb_array_elements(payload) e) p where t.day = p.d;
  insert into public.books_daily (day, rank, work_key, title, author, cover_id, first_year)
  select r.day, r.rank, r.work_key, r.title, r.author, r.cover_id, r.first_year
    from jsonb_to_recordset(payload) as r(day date, rank smallint, work_key text, title text, author text, cover_id integer, first_year smallint);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Upserts launches; future launches no longer listed (scrubbed or merged) are removed.
create or replace function public.upsert_space(launches jsonb, news jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  insert into public.space_launches as t (id, name, net, status, provider, country_code, site, mission, updated_at)
  select r.id, r.name, r.net, r.status, r.provider, r.country_code, r.site, r.mission, now()
    from jsonb_to_recordset(launches) as r(id text, name text, net timestamptz, status text, provider text, country_code text, site text, mission text)
  on conflict (id) do update set name = excluded.name, net = excluded.net, status = excluded.status, provider = excluded.provider,
    country_code = excluded.country_code, site = excluded.site, mission = excluded.mission, updated_at = now();
  get diagnostics n = row_count;
  if jsonb_array_length(launches) > 0 then
    delete from public.space_launches t where t.net > now() + interval '1 hour'
      and t.net <= (select max((e->>'net')::timestamptz) from jsonb_array_elements(launches) e)
      and not exists (select 1 from jsonb_array_elements(launches) e where e->>'id' = t.id);
  end if;
  insert into public.space_news (id, title, url, site, published_at)
  select r.id, r.title, r.url, r.site, r.published_at
    from jsonb_to_recordset(news) as r(id integer, title text, url text, site text, published_at timestamptz)
  on conflict (id) do update set title = excluded.title, url = excluded.url, site = excluded.site, published_at = excluded.published_at;
  return n;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['books_daily', 'space_launches', 'space_news'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read access" on public.%I', t);
    execute format('create policy "Public read access" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

revoke execute on function public.replace_books_daily(jsonb) from public, anon, authenticated;
revoke execute on function public.upsert_space(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_books_daily(jsonb) to service_role;
grant execute on function public.upsert_space(jsonb, jsonb) to service_role;
