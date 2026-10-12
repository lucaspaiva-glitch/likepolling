-- Recalibrate the "Est. watching YouTube" ticker.
-- Baselines: YouTube ad reach per country published in Google's ad planning
-- tools, late 2025 (via DataReportal "Digital 2026" country reports). Ad reach
-- is not the same as monthly active users, but it is the only per-country
-- figure Google publishes. Top 40 countries by that figure; Kazakhstan (no
-- published figure) and the UAE (now below the cut-off) are replaced by
-- Romania and Belgium.
begin;

delete from public.youtube_active_users where country_code in ('KZ', 'AE');

insert into public.youtube_active_users (country_code, country_name, time_zone, baseline_mau) values
  ('RO', 'Romania', 'Europe/Bucharest', 12900000),
  ('BE', 'Belgium', 'Europe/Brussels',   9080000)
on conflict (country_code) do nothing;

update public.youtube_active_users u
   set baseline_mau = v.reach
  from (values
    ('IN', 500000000), ('US', 254000000), ('ID', 151000000), ('BR', 150000000),
    ('MX',  85000000), ('JP',  78500000), ('DE',  64700000), ('VN',  62100000),
    ('PH',  59600000), ('TR',  57900000), ('GB',  55500000), ('PK',  54300000),
    ('FR',  51500000), ('BD',  49800000), ('EG',  49300000), ('TH',  47200000),
    ('KR',  42900000), ('IT',  41200000), ('ES',  39000000), ('CA',  33000000),
    ('AR',  32900000), ('CO',  31000000), ('NG',  30500000), ('SA',  27500000),
    ('PL',  27100000), ('ZA',  26900000), ('DZ',  25400000), ('IQ',  24700000),
    ('MY',  23600000), ('UA',  23000000), ('PE',  21700000), ('MA',  21600000),
    ('AU',  21000000), ('TW',  18100000), ('NL',  15300000), ('CL',  14900000),
    ('RO',  12900000), ('KE',  12100000), ('EC',  11500000), ('BE',   9080000)
  ) as v(code, reach)
 where u.country_code = v.code;

-- Concurrent viewers = users x average daily watch time, spread across the day
-- by the diurnal curve. 50 min/day per user is an assumption anchored on
-- Similarweb's ~85 min/day per daily YouTube Android user (Aug 2025), discounted
-- because not every monthly user watches every day. Dividing by the curve's
-- 24-hour mean (0.5758) keeps the daily total equal to that watch time.
create or replace function public.refresh_youtube_active_users()
returns void
language sql
as $$
  update public.youtube_active_users
     set online_users_estimate = round(
       baseline_mau * (50.0 / 1440) *
       public.youtube_diurnal_weight(now() at time zone time_zone) / 0.5758
     ),
         updated_at = now();
$$;

revoke execute on function public.refresh_youtube_active_users() from public, anon, authenticated;

select public.refresh_youtube_active_users();

commit;
