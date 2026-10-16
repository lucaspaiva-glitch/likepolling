-- World News Wire: Google News "Top stories" for each of the 41 Trending Index
-- countries, in Google News' own order, filled hourly by
-- scripts/news-world-routine.js. Adds one new table and one write function;
-- no existing table, function or policy is changed.

create table if not exists public.news_world (
  country_code  text        not null check (country_code ~ '^[A-Z]{2}$'),
  link          text        not null,
  rank          integer     not null,
  title         text        not null,
  source        text,
  published_at  timestamptz,
  image_url     text,
  fetched_at    timestamptz not null default now(),
  primary key (country_code, link)
);
create index if not exists news_world_country_rank on public.news_world (country_code, rank);

-- Replaces every country present in the payload in one transaction, so a
-- country whose feed failed keeps its previous stories.
create or replace function public.replace_news_world(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.news_world t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(payload) e);

  insert into public.news_world (country_code, link, rank, title, source, published_at, image_url, fetched_at)
  select r.country_code, r.link, r.rank, r.title, r.source, r.published_at, r.image_url, now()
    from jsonb_to_recordset(payload) as r(country_code text, link text, rank integer, title text, source text, published_at timestamptz, image_url text)
  on conflict (country_code, link) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_world(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_world(jsonb) to service_role;

alter table public.news_world enable row level security;
drop policy if exists "Public read access" on public.news_world;
create policy "Public read access" on public.news_world for select to anon, authenticated using (true);
revoke insert, update, delete on public.news_world from anon, authenticated;
grant select on public.news_world to anon, authenticated;
