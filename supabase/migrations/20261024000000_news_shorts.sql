-- Creator News Wire: real YouTube Shorts about the creator economy, per site language.
-- Filled every 8 hours by scripts/news-shorts-routine.js (YouTube search.list + videos.list).
-- Public read; writes only through replace_news_shorts(jsonb), service role only.

create table if not exists public.news_shorts (
  lang           text        not null check (lang in ('en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja')),
  video_id       text        not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  rank           integer     not null,
  title          text        not null,
  channel_id     text        not null,
  channel_title  text        not null,
  duration_s     integer,
  view_count     bigint,
  published_at   timestamptz not null,
  fetched_at     timestamptz not null default now(),
  primary key (lang, video_id)
);

create index if not exists news_shorts_lang_rank_idx on public.news_shorts (lang, rank);

create or replace function public.replace_news_shorts(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.news_shorts t
   where t.lang in (select distinct e->>'lang' from jsonb_array_elements(payload) e);

  insert into public.news_shorts (lang, video_id, rank, title, channel_id, channel_title, duration_s, view_count, published_at, fetched_at)
  select r.lang, r.video_id, r.rank, r.title, r.channel_id, r.channel_title, r.duration_s, r.view_count, r.published_at, now()
    from jsonb_to_recordset(payload) as r(lang text, video_id text, rank integer, title text, channel_id text, channel_title text, duration_s integer, view_count bigint, published_at timestamptz)
  on conflict (lang, video_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_shorts(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_shorts(jsonb) to service_role;

alter table public.news_shorts enable row level security;
drop policy if exists "Public read access" on public.news_shorts;
create policy "Public read access" on public.news_shorts for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.news_shorts from anon, authenticated;
grant select on public.news_shorts to anon, authenticated;
