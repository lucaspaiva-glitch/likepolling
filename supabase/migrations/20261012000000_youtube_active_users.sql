-- Estimated YouTube users active "right now" per country, for the top-of-page
-- ticker. YouTube publishes no per-country concurrency data, so this is a model:
--   estimate = baseline_mau * PEAK_CONCURRENCY * diurnal_weight(local time)
-- baseline_mau: approximate YouTube users per country (DataReportal
-- "Digital 2025" YouTube ad-reach figures, rounded). PEAK_CONCURRENCY (3.5%)
-- assumes ~50% of monthly users watch on a given day for ~50 min, with the
-- evening peak about twice the daily average. pg_cron recalculates every
-- row in one UPDATE at 00:00 and 12:00 UTC, so the whole set changes together.
begin;

create table if not exists public.youtube_active_users (
  country_code          char(2) primary key,
  country_name          text        not null,
  time_zone             text        not null,
  baseline_mau          bigint      not null check (baseline_mau > 0),
  online_users_estimate bigint      not null default 0,
  updated_at            timestamptz not null default now()
);

insert into public.youtube_active_users (country_code, country_name, time_zone, baseline_mau) values
  ('IN', 'India',          'Asia/Kolkata',         491000000),
  ('US', 'United States',  'America/Chicago',      253000000),
  ('BR', 'Brazil',         'America/Sao_Paulo',    144000000),
  ('ID', 'Indonesia',      'Asia/Jakarta',         143000000),
  ('MX', 'Mexico',         'America/Mexico_City',   83000000),
  ('JP', 'Japan',          'Asia/Tokyo',            78000000),
  ('PK', 'Pakistan',       'Asia/Karachi',          72000000),
  ('DE', 'Germany',        'Europe/Berlin',         67000000),
  ('VN', 'Vietnam',        'Asia/Ho_Chi_Minh',      62000000),
  ('PH', 'Philippines',    'Asia/Manila',           58000000),
  ('TR', 'Turkey',         'Europe/Istanbul',       58000000),
  ('GB', 'United Kingdom', 'Europe/London',         55000000),
  ('FR', 'France',         'Europe/Paris',          50000000),
  ('EG', 'Egypt',          'Africa/Cairo',          46000000),
  ('TH', 'Thailand',       'Asia/Bangkok',          44000000),
  ('KR', 'South Korea',    'Asia/Seoul',            42000000),
  ('IT', 'Italy',          'Europe/Rome',           41000000),
  ('BD', 'Bangladesh',     'Asia/Dhaka',            37000000),
  ('CO', 'Colombia',       'America/Bogota',        37000000),
  ('ES', 'Spain',          'Europe/Madrid',         37000000),
  ('NG', 'Nigeria',        'Africa/Lagos',          37000000),
  ('SA', 'Saudi Arabia',   'Asia/Riyadh',           33000000),
  ('AR', 'Argentina',      'America/Argentina/Buenos_Aires', 32000000),
  ('CA', 'Canada',         'America/Toronto',       32000000),
  ('PL', 'Poland',         'Europe/Warsaw',         30000000),
  ('ZA', 'South Africa',   'Africa/Johannesburg',   26000000),
  ('IQ', 'Iraq',           'Asia/Baghdad',          25000000),
  ('MY', 'Malaysia',       'Asia/Kuala_Lumpur',     24000000),
  ('MA', 'Morocco',        'Africa/Casablanca',     24000000),
  ('DZ', 'Algeria',        'Africa/Algiers',        24000000),
  ('PE', 'Peru',           'America/Lima',          22000000),
  ('AU', 'Australia',      'Australia/Sydney',      21000000),
  ('UA', 'Ukraine',        'Europe/Kyiv',           20000000),
  ('TW', 'Taiwan',         'Asia/Taipei',           18000000),
  ('NL', 'Netherlands',    'Europe/Amsterdam',      15000000),
  ('CL', 'Chile',          'America/Santiago',      15000000),
  ('KE', 'Kenya',          'Africa/Nairobi',        15000000),
  ('KZ', 'Kazakhstan',     'Asia/Almaty',           15000000),
  ('EC', 'Ecuador',        'America/Guayaquil',     13000000),
  ('AE', 'United Arab Emirates', 'Asia/Dubai',       9000000)
on conflict (country_code) do update
  set country_name = excluded.country_name,
      time_zone    = excluded.time_zone,
      baseline_mau = excluded.baseline_mau;

-- Share of peak viewers by local hour (index 0 = midnight); peak ~21:00, trough ~04:00.
create or replace function public.youtube_diurnal_weight(local_ts timestamp)
returns double precision
language sql immutable
as $$
  with w(a) as (
    select array[.62,.42,.28,.20,.17,.18,.24,.33,.42,.48,.52,.56,
                 .62,.63,.62,.63,.68,.75,.83,.92,.98,1.0,.94,.80,.62]::double precision[]
  ), h(x) as (
    select extract(hour from local_ts) + extract(minute from local_ts) / 60.0
  )
  select a[floor(x)::int + 1] + (a[floor(x)::int + 2] - a[floor(x)::int + 1]) * (x - floor(x))
  from w, h
$$;

-- Single statement => every country is recalculated and committed together.
create or replace function public.refresh_youtube_active_users()
returns void
language sql
as $$
  update public.youtube_active_users
     set online_users_estimate = round(baseline_mau * 0.035 * public.youtube_diurnal_weight(now() at time zone time_zone)),
         updated_at = now();
$$;

revoke execute on function public.youtube_diurnal_weight(timestamp) from public, anon, authenticated;
revoke execute on function public.refresh_youtube_active_users() from public, anon, authenticated;

alter table public.youtube_active_users enable row level security;
drop policy if exists "Public read access" on public.youtube_active_users;
create policy "Public read access" on public.youtube_active_users for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.youtube_active_users from anon, authenticated;
grant select on public.youtube_active_users to anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid) from cron.job where jobname = 'refresh-youtube-active-users';
select cron.schedule('refresh-youtube-active-users', '0 0,12 * * *', 'select public.refresh_youtube_active_users()');

select public.refresh_youtube_active_users();

commit;
