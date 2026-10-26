-- YouTube API data may be kept for at most 30 days, so the history tables that hold YouTube data
-- (trending, music, education videos, and education subjects, which include video counts and titles)
-- now keep 30 days. World News headlines come from Google News, not YouTube, and keep 365 days.
create or replace function public.prune_history()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.youtube_trending_history where snapshot_at < now() - interval '30 days';
  delete from public.youtube_music_chart_history where snapshot_at < now() - interval '30 days';
  delete from public.education_videos_history where snapshot_at < now() - interval '30 days';
  delete from public.education_subjects_history where snapshot_at < now() - interval '30 days';
  delete from public.news_world_history where snapshot_at < now() - interval '365 days';
end;
$$;

revoke execute on function public.prune_history() from public, anon, authenticated;
grant execute on function public.prune_history() to service_role;
