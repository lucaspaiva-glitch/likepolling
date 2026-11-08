-- Anonymous interest counters for the company dashboard (Vault): page visits and Gumroad "Buy" clicks
-- per visitor country per day. No IP, cookie or user data is stored.
create table if not exists public.interest_daily (
  day date not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  kind text not null check (kind in ('visit', 'buy')),
  item text not null check (item ~ '^[a-z]{2,12}$'),
  n integer not null default 0,
  primary key (day, country_code, kind, item)
);
alter table public.interest_daily enable row level security;
revoke all on public.interest_daily from anon, authenticated;
grant all on public.interest_daily to service_role;

create or replace function public.bump_interest(p_country text, p_kind text, p_item text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.interest_daily as s (day, country_code, kind, item, n)
  values ((now() at time zone 'utc')::date, p_country, p_kind, p_item, 1)
  on conflict (day, country_code, kind, item) do update set n = s.n + 1;
$$;
revoke all on function public.bump_interest(text, text, text) from public, anon, authenticated;
grant execute on function public.bump_interest(text, text, text) to service_role;
