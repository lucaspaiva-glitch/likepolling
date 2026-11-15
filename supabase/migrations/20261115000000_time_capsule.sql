-- Time capsule: a permanent archive of every story that reached a top 10 in World News, Fashion
-- News or AI news (one row per story, with its headline and summary in every site language), a
-- dated snapshot of every report, and World News history copies kept forever (no more 365-day
-- prune). YouTube data still keeps 30 days (YouTube's limit).

create table if not exists public.news_archive (
  section       text        not null check (section in ('world', 'fashion', 'ai')),
  country_code  text        not null,
  link          text        not null,
  title         text        not null,
  title_en      text,
  summary_en    text,
  title_tr      jsonb,
  source        text,
  published_at  timestamptz,
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  best_rank     int         not null,
  primary key (section, country_code, link)
);
create index if not exists news_archive_seen on public.news_archive (country_code, first_seen);

alter table public.news_archive enable row level security;
revoke all on public.news_archive from anon, authenticated;
grant all on public.news_archive to service_role;

create table if not exists public.report_snapshots (
  day       date        not null,
  kind      text        not null,
  subjects  text        not null,
  body      jsonb       not null,
  saved_at  timestamptz not null default now(),
  primary key (day, kind, subjects)
);

alter table public.report_snapshots enable row level security;
revoke all on public.report_snapshots from anon, authenticated;
grant all on public.report_snapshots to service_role;

create or replace function public.archive_news()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.news_archive as a (section, country_code, link, title, title_en, summary_en, title_tr, source, published_at, best_rank)
  select distinct on (s.section, s.country_code, s.link) s.section, s.country_code, s.link, s.title,
         nullif(s.title_tr->>'en', ''), nullif(s.title_tr->'sum'->>'en', ''), s.title_tr, s.source, s.published_at, s.rank
  from (
    select 'world' section, t.country_code, t.link, t.title, t.title_tr, t.source, t.published_at, t.rank from public.news_world t where t.rank <= 10
    union all select 'fashion', t.country_code, t.link, t.title, t.title_tr, t.source, t.published_at, t.rank from public.news_fashion t where t.rank <= 10
    union all select 'ai', t.country_code, t.link, t.title, t.title_tr, t.source, t.published_at, t.rank from public.news_ai t where t.rank <= 10
  ) s
  order by s.section, s.country_code, s.link, s.rank
  on conflict (section, country_code, link) do update
    set last_seen = now(),
        best_rank = least(a.best_rank, excluded.best_rank),
        title_en = coalesce(excluded.title_en, a.title_en),
        summary_en = coalesce(excluded.summary_en, a.summary_en),
        title_tr = coalesce(excluded.title_tr, a.title_tr);
end;
$$;
revoke execute on function public.archive_news() from public, anon, authenticated;
grant execute on function public.archive_news() to service_role;

-- World News copies are kept forever now; only YouTube data is pruned (30 days).
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
end;
$$;
revoke execute on function public.prune_history() from public, anon, authenticated;
grant execute on function public.prune_history() to service_role;

-- Hourly at :05, so every World News (every 3 hours), Fashion and AI run is caught.
select cron.schedule('archive-news', '5 * * * *', 'select public.archive_news()');

-- Backfill from the World News copies we already have (since 24 October 2026).
insert into public.news_archive (section, country_code, link, title, title_en, summary_en, title_tr, source, published_at, first_seen, last_seen, best_rank)
select 'world', h.country_code, h.link, (array_agg(h.title order by h.snapshot_at desc))[1],
       (array_agg(nullif(h.title_tr->>'en', '') order by h.snapshot_at desc) filter (where nullif(h.title_tr->>'en', '') is not null))[1],
       (array_agg(nullif(h.title_tr->'sum'->>'en', '') order by h.snapshot_at desc) filter (where nullif(h.title_tr->'sum'->>'en', '') is not null))[1],
       (array_agg(h.title_tr order by h.snapshot_at desc) filter (where h.title_tr is not null))[1],
       (array_agg(h.source order by h.snapshot_at desc))[1], max(h.published_at), min(h.snapshot_at), max(h.snapshot_at), min(h.rank)
from public.news_world_history h
group by h.country_code, h.link
on conflict do nothing;

select public.archive_news();
