-- News coverage per country per month: the share of all news articles worldwide (GDELT DOC API,
-- "volume intensity", in %) that mention the country, averaged per month, last 3 full years.
-- Saved weekly by scripts/news-coverage-routine.js; read by the World News chart.
create table if not exists public.news_coverage_monthly (
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  month        date not null,
  share        numeric not null,
  saved_at     timestamptz not null default now(),
  primary key (country_code, month)
);
alter table public.news_coverage_monthly enable row level security;
drop policy if exists "Public read access" on public.news_coverage_monthly;
create policy "Public read access" on public.news_coverage_monthly for select to anon, authenticated using (true);
grant select on public.news_coverage_monthly to anon, authenticated;
grant all on public.news_coverage_monthly to service_role;

-- Each month's top World News story for a country, from the time capsule archive: among the stories
-- that reached #1 that month, the one that stayed longest. Headline and summary in every site language.
create or replace function public.month_top_stories(p_country text)
returns table (month date, title_en text, title_tr jsonb, source text, link text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (date_trunc('month', a.first_seen))
         date_trunc('month', a.first_seen)::date, a.title_en, a.title_tr, a.source, a.link
    from public.news_archive a
   where a.section = 'world' and a.country_code = p_country and a.best_rank = 1
   order by date_trunc('month', a.first_seen), (a.last_seen - a.first_seen) desc, a.first_seen;
$$;
revoke all on function public.month_top_stories(text) from public;
grant execute on function public.month_top_stories(text) to anon, authenticated, service_role;

-- News coverage of the brands and magazines in the homepage Fashion Index, same measure and job.
create table if not exists public.brand_coverage_monthly (
  brand    text not null check (length(brand) between 1 and 60),
  month    date not null,
  share    numeric not null,
  saved_at timestamptz not null default now(),
  primary key (brand, month)
);
alter table public.brand_coverage_monthly enable row level security;
drop policy if exists "Public read access" on public.brand_coverage_monthly;
create policy "Public read access" on public.brand_coverage_monthly for select to anon, authenticated using (true);
grant select on public.brand_coverage_monthly to anon, authenticated;
grant all on public.brand_coverage_monthly to service_role;
