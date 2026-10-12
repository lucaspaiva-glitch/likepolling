-- Add Portugal to the tracked countries (active-users ticker + Trending Index).
-- Baseline: Google's YouTube ad reach in Portugal, late 2025: 7.59M
-- (DataReportal, Digital 2026: Portugal), the same source as the other countries.
-- Its first estimate is computed for the current snapshot time, so the other
-- countries keep their peak-time figures until the next scheduled refresh.
insert into public.youtube_active_users
  (country_code, country_name, time_zone, baseline_mau, online_users_estimate, updated_at)
select 'PT', 'Portugal', 'Europe/Lisbon', 7590000,
       round(7590000 * (50.0 / 1440) *
             public.youtube_diurnal_weight(s.t at time zone 'Europe/Lisbon') / 0.5758),
       s.t
  from (select coalesce(max(updated_at), now()) as t from public.youtube_active_users) s
on conflict (country_code) do nothing;
