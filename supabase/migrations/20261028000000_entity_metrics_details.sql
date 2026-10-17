-- Channel Intelligence: per-video figures (views, likes, comments, date, length) and the
-- channel profile for the latest metric row of each searched channel, as returned by the
-- YouTube Data API (no derived scores). api/metrics.js clears details on a channel's older
-- rows on every refresh; this daily job drops anything older than 30 days (YouTube API
-- storage rule). Additive: existing columns and rows are unchanged.
begin;

alter table public.entity_metrics add column if not exists details jsonb;

select cron.schedule(
  'clear-entity-metrics-details',
  '17 4 * * *',
  $$update public.entity_metrics set details = null where details is not null and created_at < now() - interval '30 days'$$
);

commit;
