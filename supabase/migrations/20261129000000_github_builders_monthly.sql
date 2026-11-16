-- Where AI is built: each month's 100 most-starred new AI projects on GitHub (since 2017), with the country of
-- the builder, read from the location written on their GitHub profile. Saved by scripts/github-countries-routine.js.
create table if not exists public.github_ai_builders_monthly (
  month         date      not null,
  rank          smallint  not null check (rank between 1 and 100),
  full_name     text      not null check (length(full_name) between 3 and 140),
  description   text,
  stars         integer   not null,
  url           text      not null,
  location      text,
  country_code  text      check (country_code ~ '^[A-Z]{2}$'),
  plain         jsonb,
  primary key (month, full_name)
);
create index if not exists github_ai_builders_monthly_cc on public.github_ai_builders_monthly (country_code, month);
alter table public.github_ai_builders_monthly enable row level security;
drop policy if exists "Public read access" on public.github_ai_builders_monthly;
create policy "Public read access" on public.github_ai_builders_monthly for select to anon, authenticated using (true);
grant select on public.github_ai_builders_monthly to anon, authenticated;
grant all on public.github_ai_builders_monthly to service_role;
