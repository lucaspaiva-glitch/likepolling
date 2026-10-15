-- Raise the active-users model's daily watch time from 50 to 80 min per user.
-- 50 min was anchored on the ~85 min/day a typical YouTube Android user spends in
-- the app (DataReportal Digital 2026: 5.9 sessions x 14.5 min), discounted for
-- non-daily users. That figure covers the phone app only and misses TV and
-- computers; TV alone is 13.8% of all US TV viewing (Nielsen, May 2026), which
-- would leave too little room for phones and computers under 50 min.
-- 80 min counts all screens (phones, computers, tablets, TVs). Dividing by the
-- curve's 24-hour mean (0.5758) keeps the daily total equal to that watch time.
-- Only the function body changes; it is then run once so the ticker updates now.
begin;

create or replace function public.refresh_youtube_active_users()
returns void
language sql
as $$
  update public.youtube_active_users
     set online_users_estimate = round(
       baseline_mau * (80.0 / 1440) *
       public.youtube_diurnal_weight(now() at time zone time_zone) / 0.5758
     ),
         updated_at = now();
$$;

revoke execute on function public.refresh_youtube_active_users() from public, anon, authenticated;

select public.refresh_youtube_active_users();

commit;
