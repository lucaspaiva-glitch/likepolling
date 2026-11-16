-- AI Builders "This month" / "This year" lists: most-starred AI projects created in the last 30 / 365 days,
-- saved weekly by scripts/github-routine.js next to the 7-day list in github_ai_repos_weekly.
create table if not exists public.github_ai_repos_top (
  day          date      not null,
  period       text      not null check (period in ('month', 'year')),
  rank         smallint  not null check (rank between 1 and 50),
  full_name    text      not null check (length(full_name) between 3 and 140),
  description  text,
  stars        integer   not null,
  language     text,
  url          text      not null,
  plain        jsonb,
  primary key (day, period, full_name)
);
alter table public.github_ai_repos_top enable row level security;
drop policy if exists "Public read access" on public.github_ai_repos_top;
create policy "Public read access" on public.github_ai_repos_top for select to anon, authenticated using (true);
grant select on public.github_ai_repos_top to anon, authenticated;
grant all on public.github_ai_repos_top to service_role;
