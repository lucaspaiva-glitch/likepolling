-- Google search interest by state (Google Trends, last 30 days, 0-100) for every person or brand a
-- report is built on, so the history grows with each report. Written by /api/report with the service key.
create table if not exists public.region_interest_daily (
  day           date     not null,
  subject       text     not null check (length(subject) between 1 and 120),
  country_code  text     not null check (country_code ~ '^[A-Z]{2}$'),
  region_code   text     not null check (length(region_code) between 2 and 12),
  region_name   text     not null,
  value         smallint not null check (value between 0 and 100),
  primary key (day, subject, country_code, region_code)
);
create index if not exists region_interest_daily_subject on public.region_interest_daily (subject, day desc);
alter table public.region_interest_daily enable row level security;
revoke all on public.region_interest_daily from anon, authenticated;
grant all on public.region_interest_daily to service_role;
