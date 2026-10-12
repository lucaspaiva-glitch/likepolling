-- YouTube Trending widget: latest "most popular" chart per tracked country.
-- Only the newest snapshot is kept (written by scripts/trending-routine.js).
-- Additive: reads public.youtube_active_users for the country list, changes nothing else.
create table if not exists public.youtube_trending (
  country_code   char(2)     not null,
  rank           smallint    not null check (rank between 1 and 50),
  video_id       text        not null,
  title          text        not null,
  channel_id     text        not null,
  channel_title  text        not null,
  category_id    text,
  thumbnail_url  text,
  view_count     bigint,
  like_count     bigint,
  comment_count  bigint,
  published_at   timestamptz,
  fetched_at     timestamptz not null default now(),
  primary key (country_code, rank)
);

-- Replaces the snapshot for every country in the payload in one transaction,
-- and drops countries that are no longer tracked.
create or replace function public.replace_youtube_trending(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.youtube_trending t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(payload) e)
      or t.country_code not in (select country_code from public.youtube_active_users);

  insert into public.youtube_trending (country_code, rank, video_id, title, channel_id, channel_title,
                                       category_id, thumbnail_url, view_count, like_count, comment_count,
                                       published_at, fetched_at)
  select r.country_code, r.rank, r.video_id, r.title, r.channel_id, r.channel_title,
         r.category_id, r.thumbnail_url, r.view_count, r.like_count, r.comment_count,
         r.published_at, now()
    from jsonb_to_recordset(payload) as r(country_code char(2), rank smallint, video_id text, title text,
                                          channel_id text, channel_title text, category_id text,
                                          thumbnail_url text, view_count bigint, like_count bigint,
                                          comment_count bigint, published_at timestamptz);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_youtube_trending(jsonb) from public, anon, authenticated;
grant execute on function public.replace_youtube_trending(jsonb) to service_role;

alter table public.youtube_trending enable row level security;
drop policy if exists "Public read access" on public.youtube_trending;
create policy "Public read access" on public.youtube_trending for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.youtube_trending from anon, authenticated;
grant select on public.youtube_trending to anon, authenticated;
