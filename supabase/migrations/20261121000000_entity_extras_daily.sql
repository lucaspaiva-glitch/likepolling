-- Extra open data saved each time a People or Company report is built, so the history grows:
-- Wikidata profile and follower counts, MusicBrainz releases, 30-day Google search interest vs rivals,
-- and the biggest Wikipedia attention spikes ("media moments"). Written by /api/report with the service key.
create table if not exists public.entity_extras_daily (
  day        date  not null,
  subject    text  not null check (length(subject) between 1 and 120),
  profile    jsonb,
  releases   jsonb,
  searches   jsonb,
  moments    jsonb,
  primary key (day, subject)
);
alter table public.entity_extras_daily enable row level security;
revoke all on public.entity_extras_daily from anon, authenticated;
grant all on public.entity_extras_daily to service_role;
