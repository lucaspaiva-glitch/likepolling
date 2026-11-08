-- Size of every Gemini request Like Polling makes, read by Vault to show the prepaid credit left (private).
create table if not exists public.gemini_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null,
  model text not null,
  status text not null default 'ok' check (status in ('ok', 'no_credit')),
  input_tokens integer not null default 0,
  output_tokens integer not null default 0
);
create index if not exists gemini_usage_at on public.gemini_usage (at);
alter table public.gemini_usage enable row level security;
revoke all on public.gemini_usage from anon, authenticated;
grant all on public.gemini_usage to service_role;
