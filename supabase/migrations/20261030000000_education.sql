-- Education section: the fastest-growing recent uploads of the education channels
-- in scripts/education-channels.json, and the subjects most talked about across those
-- videos and the last 24 h of Google News education headlines, per country.
-- Filled twice a day by scripts/education-routine.js. Adds two tables and one write
-- function; no existing table, function or policy is changed.

create table if not exists public.education_videos (
  country_code    text        not null check (country_code ~ '^[A-Z]{2}$'),
  rank            smallint    not null check (rank between 1 and 50),
  video_id        text        not null,
  title           text        not null,
  channel_id      text        not null,
  channel_title   text        not null,
  thumbnail_url   text,
  view_count      bigint,
  like_count      bigint,
  published_at    timestamptz,
  views_per_hour  bigint,
  subject         text,
  fetched_at      timestamptz not null default now(),
  primary key (country_code, rank)
);

create table if not exists public.education_subjects (
  country_code         text        not null check (country_code ~ '^[A-Z]{2}$'),
  rank                 smallint    not null check (rank between 1 and 50),
  subject              text        not null,
  score                integer     not null,
  video_count          integer     not null,
  news_count           integer     not null,
  example_video_id     text,
  example_video_title  text,
  example_news_title   text,
  example_news_link    text,
  example_news_source  text,
  fetched_at           timestamptz not null default now(),
  primary key (country_code, rank)
);

-- Replaces, in one transaction, the videos of every country in `videos` and the
-- subjects of every country in `subjects`. A country missing from a payload (its
-- fetch or classification failed) keeps its previous rows.
create or replace function public.replace_education(videos jsonb, subjects jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
  m integer;
begin
  delete from public.education_videos t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(videos) e);
  insert into public.education_videos (country_code, rank, video_id, title, channel_id, channel_title, thumbnail_url,
                                       view_count, like_count, published_at, views_per_hour, subject, fetched_at)
  select r.country_code, r.rank, r.video_id, r.title, r.channel_id, r.channel_title, r.thumbnail_url,
         r.view_count, r.like_count, r.published_at, r.views_per_hour, r.subject, now()
    from jsonb_to_recordset(videos) as r(country_code text, rank smallint, video_id text, title text, channel_id text,
                                         channel_title text, thumbnail_url text, view_count bigint, like_count bigint,
                                         published_at timestamptz, views_per_hour bigint, subject text);
  get diagnostics n = row_count;

  delete from public.education_subjects t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(subjects) e);
  insert into public.education_subjects (country_code, rank, subject, score, video_count, news_count, example_video_id,
                                         example_video_title, example_news_title, example_news_link, example_news_source, fetched_at)
  select r.country_code, r.rank, r.subject, r.score, r.video_count, r.news_count, r.example_video_id,
         r.example_video_title, r.example_news_title, r.example_news_link, r.example_news_source, now()
    from jsonb_to_recordset(subjects) as r(country_code text, rank smallint, subject text, score integer, video_count integer,
                                           news_count integer, example_video_id text, example_video_title text,
                                           example_news_title text, example_news_link text, example_news_source text);
  get diagnostics m = row_count;
  return n + m;
end;
$$;

revoke execute on function public.replace_education(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_education(jsonb, jsonb) to service_role;

-- Tables created after 2026-10-30 get no automatic Data API grants, so every grant is explicit.
alter table public.education_videos enable row level security;
alter table public.education_subjects enable row level security;
drop policy if exists "Public read access" on public.education_videos;
drop policy if exists "Public read access" on public.education_subjects;
create policy "Public read access" on public.education_videos for select to anon, authenticated using (true);
create policy "Public read access" on public.education_subjects for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.education_videos, public.education_subjects from anon, authenticated;
grant select on public.education_videos, public.education_subjects to anon, authenticated;
grant select, insert, update, delete on public.education_videos, public.education_subjects to service_role;
