-- Anonymous reading time per news section (World News, Fashion, AI) per visitor country per day:
-- readers = page views that spent at least a second in the section, seconds = their time on screen.
-- No IP, cookie or user data is stored.
create table if not exists public.reading_daily (
  day date not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  section text not null check (section in ('news', 'fashion', 'ai')),
  readers integer not null default 0,
  seconds bigint not null default 0,
  primary key (day, country_code, section)
);
alter table public.reading_daily enable row level security;
revoke all on public.reading_daily from anon, authenticated;
grant all on public.reading_daily to service_role;

create or replace function public.bump_reading(p_country text, p_section text, p_seconds integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reading_daily as s (day, country_code, section, readers, seconds)
  values ((now() at time zone 'utc')::date, p_country, p_section, 1, least(greatest(p_seconds, 0), 1800))
  on conflict (day, country_code, section) do update set readers = s.readers + 1, seconds = s.seconds + excluded.seconds;
$$;
revoke all on function public.bump_reading(text, text, integer) from public, anon, authenticated;
grant execute on function public.bump_reading(text, text, integer) to service_role;
