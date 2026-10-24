-- History: twice a day, keep a copy of the top 10 per country of Trending, Music and World News,
-- and every Education row, so trends over time can be shown. Rows older than 1 year are deleted.
-- Runs inside Supabase (pg_cron), so it needs no extra YouTube, Gemini or GitHub runs.

create table if not exists public.youtube_trending_history (snapshot_at timestamptz not null default now(), like public.youtube_trending);
create table if not exists public.youtube_music_chart_history (snapshot_at timestamptz not null default now(), like public.youtube_music_chart);
create table if not exists public.news_world_history (snapshot_at timestamptz not null default now(), like public.news_world);
create table if not exists public.education_videos_history (snapshot_at timestamptz not null default now(), like public.education_videos);
create table if not exists public.education_subjects_history (snapshot_at timestamptz not null default now(), like public.education_subjects);

do $$
declare t text;
begin
  foreach t in array array['youtube_trending_history', 'youtube_music_chart_history', 'news_world_history', 'education_videos_history', 'education_subjects_history'] loop
    execute format('create index if not exists %I on public.%I (country_code, snapshot_at desc)', t || '_cc_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Public read" on public.%I', t);
    execute format('create policy "Public read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

create or replace function public.snapshot_history()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.youtube_trending_history select now(), t.* from public.youtube_trending t where t.rank <= 10;
  insert into public.youtube_music_chart_history select now(), t.* from public.youtube_music_chart t where t.rank <= 10;
  insert into public.news_world_history select now(), t.* from public.news_world t where t.rank <= 10;
  insert into public.education_videos_history select now(), t.* from public.education_videos t;
  insert into public.education_subjects_history select now(), t.* from public.education_subjects t;
end;
$$;

create or replace function public.prune_history()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.youtube_trending_history where snapshot_at < now() - interval '365 days';
  delete from public.youtube_music_chart_history where snapshot_at < now() - interval '365 days';
  delete from public.news_world_history where snapshot_at < now() - interval '365 days';
  delete from public.education_videos_history where snapshot_at < now() - interval '365 days';
  delete from public.education_subjects_history where snapshot_at < now() - interval '365 days';
end;
$$;

revoke execute on function public.snapshot_history() from public, anon, authenticated;
revoke execute on function public.prune_history() from public, anon, authenticated;
grant execute on function public.snapshot_history() to service_role;
grant execute on function public.prune_history() to service_role;

-- 00:50 and 12:50 UTC: after News (00:00/12:00), Education (:23), Trending (:17) and Music (:37).
select cron.schedule('snapshot-history', '50 0,12 * * *', 'select public.snapshot_history()');
select cron.schedule('prune-history', '15 3 * * *', 'select public.prune_history()');

-- First snapshot right away.
select public.snapshot_history();
