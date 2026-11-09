-- Michelin-starred restaurants per country as recorded in Wikidata (CC0 open data), one snapshot per
-- week so the history stays. Filled by scripts/restaurants-routine.js. Public read for the homepage.
create table if not exists public.restaurants_michelin (
  day           date     not null,
  qid           text     not null check (qid ~ '^Q[0-9]+$'),
  country_code  text     not null check (country_code ~ '^[A-Z]{2}$'),
  name          text     not null,
  city          text,
  stars         smallint check (stars between 1 and 3),
  website       text,
  wiki          text,
  primary key (day, qid)
);
create index if not exists restaurants_michelin_cc_day on public.restaurants_michelin (country_code, day desc);
alter table public.restaurants_michelin enable row level security;
drop policy if exists "Public read access" on public.restaurants_michelin;
create policy "Public read access" on public.restaurants_michelin for select to anon, authenticated using (true);
grant select on public.restaurants_michelin to anon, authenticated;
grant all on public.restaurants_michelin to service_role;
