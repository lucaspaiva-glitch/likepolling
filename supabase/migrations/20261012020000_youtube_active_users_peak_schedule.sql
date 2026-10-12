-- Recalculate the active-users ticker at the two daily peaks of the model's
-- 40-country total: 15:00 UTC (Asia evening + Europe afternoon, ~110M) and
-- 03:00 UTC (Americas evening, ~73M).
select cron.unschedule('refresh-youtube-active-users')
 where exists (select 1 from cron.job where jobname = 'refresh-youtube-active-users');

select cron.schedule(
  'refresh-youtube-active-users',
  '0 3,15 * * *',
  'select public.refresh_youtube_active_users()'
);
