-- Country Inspiration Report (paid, sold through Gumroad). Buyers are never stored here:
-- Gumroad keeps the order and issues a license key, which api/report.js checks with Gumroad's
-- License API on each visit. This only adds Gemini's weekly "ideas to copy" per country
-- (scripts/report-ideas-routine.js), private to the server (service_role).

create table if not exists public.report_insights (
  country_code  text        primary key check (country_code ~ '^[A-Z]{2}$'),
  ideas         jsonb       not null,
  generated_at  timestamptz not null default now()
);

alter table public.report_insights enable row level security;
revoke all on public.report_insights from anon, authenticated;
grant all on public.report_insights to service_role;
