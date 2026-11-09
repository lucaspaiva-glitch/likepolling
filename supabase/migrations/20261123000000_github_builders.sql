-- AI Builders: weekly snapshots from the GitHub API, filled by scripts/github-routine.js. Public read for the homepage.
create table if not exists public.github_ai_repos_weekly (
  day          date      not null,
  rank         smallint  not null check (rank between 1 and 50),
  full_name    text      not null check (length(full_name) between 3 and 140),
  description  text,
  stars        integer   not null,
  language     text,
  url          text      not null,
  primary key (day, full_name)
);
create table if not exists public.github_new_devs_weekly (
  day           date     not null,
  country_code  text     not null check (country_code ~ '^[A-Z]{2}$'),
  accounts      integer  not null,
  primary key (day, country_code)
);
alter table public.github_ai_repos_weekly enable row level security;
alter table public.github_new_devs_weekly enable row level security;
drop policy if exists "Public read access" on public.github_ai_repos_weekly;
drop policy if exists "Public read access" on public.github_new_devs_weekly;
create policy "Public read access" on public.github_ai_repos_weekly for select to anon, authenticated using (true);
create policy "Public read access" on public.github_new_devs_weekly for select to anon, authenticated using (true);
grant select on public.github_ai_repos_weekly, public.github_new_devs_weekly to anon, authenticated;
grant all on public.github_ai_repos_weekly, public.github_new_devs_weekly to service_role;
