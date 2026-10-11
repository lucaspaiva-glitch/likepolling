-- Remove entities without a YouTube channel (legacy companies/politicians/
-- Twitch-only) together with their metrics. YouTube channels are kept.
begin;

delete from public.entity_metrics
where entity_id in (
  select id from public.entities where handles->>'youtube' is null
);

delete from public.entities
where handles->>'youtube' is null;

commit;
