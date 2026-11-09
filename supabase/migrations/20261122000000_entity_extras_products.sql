-- Food and drink products per brand from Open Food Facts (ODbL), saved with each Company report.
alter table public.entity_extras_daily add column if not exists products jsonb;
