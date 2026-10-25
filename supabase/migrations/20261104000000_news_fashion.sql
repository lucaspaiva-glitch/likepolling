-- Fashion News: recent fashion headlines from Google News for each of the 41
-- Trending Index countries, filled twice a day by scripts/news-fashion-routine.js.
-- title_tr holds the 9 site-language translations plus "fashion": true/false (AI check).
-- Adds one new table and one write function; nothing existing is changed.

create table if not exists public.news_fashion (
  country_code  text        not null check (country_code ~ '^[A-Z]{2}$'),
  link          text        not null,
  rank          integer     not null,
  title         text        not null,
  source        text,
  published_at  timestamptz,
  image_url     text,
  title_tr      jsonb,
  fetched_at    timestamptz not null default now(),
  primary key (country_code, link)
);
create index if not exists news_fashion_country_rank on public.news_fashion (country_code, rank);

-- Replaces every country present in the payload in one transaction, so a
-- country whose feed failed keeps its previous stories.
create or replace function public.replace_news_fashion(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.news_fashion t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(payload) e);

  insert into public.news_fashion (country_code, link, rank, title, source, published_at, image_url, title_tr, fetched_at)
  select r.country_code, r.link, r.rank, r.title, r.source, r.published_at, r.image_url, r.title_tr, now()
    from jsonb_to_recordset(payload) as r(country_code text, link text, rank integer, title text, source text, published_at timestamptz, image_url text, title_tr jsonb)
  on conflict (country_code, link) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_fashion(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_fashion(jsonb) to service_role;

alter table public.news_fashion enable row level security;
drop policy if exists "Public read access" on public.news_fashion;
create policy "Public read access" on public.news_fashion for select to anon, authenticated using (true);
revoke insert, update, delete on public.news_fashion from anon, authenticated;
grant select on public.news_fashion to anon, authenticated;
grant select, insert, update, delete on public.news_fashion to service_role;
