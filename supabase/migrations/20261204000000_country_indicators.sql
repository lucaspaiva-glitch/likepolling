-- World Bank country numbers (GDP, growth, inflation, unemployment, population), saved weekly by
-- scripts/worldbank-routine.js. Search pages read them when the live World Bank API is down.
create table if not exists public.country_indicators (
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  indicator    text not null,
  year         int not null,
  value        double precision not null,
  saved_at     timestamptz not null default now(),
  primary key (country_code, indicator, year)
);
alter table public.country_indicators enable row level security;
drop policy if exists "Public read access" on public.country_indicators;
create policy "Public read access" on public.country_indicators for select to anon, authenticated using (true);
grant select on public.country_indicators to anon, authenticated;
grant all on public.country_indicators to service_role;
