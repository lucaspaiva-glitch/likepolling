-- Google "Trending now" searches across the tracked countries (Most Talked About widget).
-- Latest snapshot only; written hourly by scripts/google-trends-routine.js with the
-- secret key through replace_google_trending(). Public can read, not write.
begin;

create table if not exists public.google_trending (
  rank           smallint    primary key check (rank between 1 and 50),
  query          text        not null,
  approx_traffic text,
  traffic_min    integer     not null default 0,
  top_country    char(2),
  countries      text[]      not null default '{}',
  news_title     text,
  news_url       text,
  news_source    text,
  is_creator     boolean     not null default false,
  published_at   timestamptz,
  fetched_at     timestamptz not null default now()
);

create or replace function public.replace_google_trending(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.google_trending where rank is not null;
  insert into public.google_trending
    (rank, query, approx_traffic, traffic_min, top_country, countries,
     news_title, news_url, news_source, is_creator, published_at)
  select r.rank, r.query, r.approx_traffic, coalesce(r.traffic_min, 0), r.top_country,
         coalesce(r.countries, '{}'), r.news_title, r.news_url, r.news_source,
         coalesce(r.is_creator, false), r.published_at
    from jsonb_to_recordset(payload) as r(
      rank smallint, query text, approx_traffic text, traffic_min integer, top_country text,
      countries text[], news_title text, news_url text, news_source text,
      is_creator boolean, published_at timestamptz);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_google_trending(jsonb) from public, anon, authenticated;
grant execute on function public.replace_google_trending(jsonb) to service_role;

alter table public.google_trending enable row level security;
drop policy if exists "Public read access" on public.google_trending;
create policy "Public read access" on public.google_trending for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.google_trending from anon, authenticated;
grant select on public.google_trending to anon, authenticated;

commit;
