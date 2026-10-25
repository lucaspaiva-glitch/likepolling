-- Active-users ticker accuracy:
-- 1. Recalculate every 15 minutes (was 03:00/15:00 UTC only), so every country follows
--    its own local time instead of keeping a snapshot that can be up to 12 hours old.
-- 2. Countries spanning several time zones are split by approximate population share,
--    each share following the hourly curve in its own zone. Others keep time_zone.
-- Baselines were re-checked against DataReportal Digital 2026 (late-2025 ad reach): all 41 match.
begin;

alter table public.youtube_active_users add column if not exists time_zones jsonb;

update public.youtube_active_users set time_zones = v.z
from (values
  ('US', '{"America/New_York":0.47,"America/Chicago":0.29,"America/Denver":0.07,"America/Los_Angeles":0.17}'::jsonb),
  ('CA', '{"America/Toronto":0.62,"America/Winnipeg":0.07,"America/Edmonton":0.12,"America/Vancouver":0.14,"America/Halifax":0.05}'::jsonb),
  ('BR', '{"America/Sao_Paulo":0.92,"America/Manaus":0.07,"America/Rio_Branco":0.01}'::jsonb),
  ('MX', '{"America/Mexico_City":0.85,"America/Mazatlan":0.09,"America/Tijuana":0.03,"America/Cancun":0.03}'::jsonb),
  ('AU', '{"Australia/Sydney":0.33,"Australia/Melbourne":0.26,"Australia/Brisbane":0.21,"Australia/Perth":0.11,"Australia/Adelaide":0.07,"Australia/Darwin":0.01,"Australia/Hobart":0.01}'::jsonb),
  ('ID', '{"Asia/Jakarta":0.72,"Asia/Makassar":0.25,"Asia/Jayapura":0.03}'::jsonb)
) as v(code, z)
where country_code = v.code;

create or replace function public.refresh_youtube_active_users()
returns void
language sql
set search_path = ''
as $$
  update public.youtube_active_users u
     set online_users_estimate = round(
       u.baseline_mau * (80.0 / 1440) / 0.5758 *
       coalesce(
         (select sum(z.value::double precision * public.youtube_diurnal_weight(now() at time zone z.key))
            from jsonb_each_text(u.time_zones) z),
         public.youtube_diurnal_weight(now() at time zone u.time_zone)
       )
     ),
         updated_at = now();
$$;
revoke execute on function public.refresh_youtube_active_users() from public, anon, authenticated;

select cron.unschedule('refresh-youtube-active-users')
 where exists (select 1 from cron.job where jobname = 'refresh-youtube-active-users');
select cron.schedule('refresh-youtube-active-users', '*/15 * * * *', 'select public.refresh_youtube_active_users()');

select public.refresh_youtube_active_users();

commit;
