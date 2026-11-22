-- Trending politicians: per tracked country, the 5 political figures named in the most World News headlines over the
-- last 7 days. Saved daily by scripts/politics-routine.js (Gemini reads the headlines); read by the homepage side tab.
create table if not exists public.politics_trending (
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  rank         int not null check (rank between 1 and 5),
  name         text not null,
  wiki_title   text,
  role         text,
  headlines    int not null,
  day          date not null,
  saved_at     timestamptz not null default now(),
  primary key (country_code, rank)
);
alter table public.politics_trending enable row level security;
drop policy if exists "Public read access" on public.politics_trending;
create policy "Public read access" on public.politics_trending for select to anon, authenticated using (true);
grant select on public.politics_trending to anon, authenticated;
grant all on public.politics_trending to service_role;
