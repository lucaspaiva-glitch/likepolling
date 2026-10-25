-- Ireland replaces Romania in the tracked countries (active-users ticker, Trending,
-- Music, World News, Education). Portugal is kept.
-- Baseline: Google's YouTube ad reach in Ireland, late 2025: 4.26M
-- (DataReportal, Digital 2026: Ireland), the same source as the other countries.
-- Romania's current rows are removed; history snapshots are kept.
begin;

delete from public.youtube_active_users where country_code = 'RO';
delete from public.youtube_trending where country_code = 'RO';
delete from public.youtube_music_chart where country_code = 'RO';
delete from public.news_world where country_code = 'RO';
delete from public.education_videos where country_code = 'RO';
delete from public.education_subjects where country_code = 'RO';

insert into public.youtube_active_users
  (country_code, country_name, time_zone, baseline_mau, online_users_estimate, updated_at)
values ('IE', 'Ireland', 'Europe/Dublin', 4260000,
        round(4260000 * (80.0 / 1440) * public.youtube_diurnal_weight(now() at time zone 'Europe/Dublin') / 0.5758),
        now())
on conflict (country_code) do nothing;

commit;
