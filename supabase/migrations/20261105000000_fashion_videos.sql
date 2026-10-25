-- Fashion Index: the fastest-growing recent uploads of the fashion channels in
-- scripts/fashion-channels.json, per country (Portugal: combined ranking of the
-- Italian, Spanish, French and UK channels). Filled twice a day by
-- scripts/fashion-videos-routine.js. Adds one table and one write function;
-- no existing table, function or policy is changed.

create table if not exists public.fashion_videos (
  country_code     text        not null check (country_code ~ '^[A-Z]{2}$'),
  rank             smallint    not null check (rank between 1 and 50),
  video_id         text        not null,
  title            text        not null,
  channel_id       text        not null,
  channel_title    text        not null,
  channel_country  text        check (channel_country ~ '^[A-Z]{2}$'),
  thumbnail_url    text,
  view_count       bigint,
  like_count       bigint,
  published_at     timestamptz,
  views_per_hour   bigint,
  fetched_at       timestamptz not null default now(),
  primary key (country_code, rank)
);

-- Replaces, in one transaction, the videos of every country in `videos`.
-- A country missing from the payload (its fetch failed) keeps its previous rows.
create or replace function public.replace_fashion_videos(videos jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.fashion_videos t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(videos) e);
  insert into public.fashion_videos (country_code, rank, video_id, title, channel_id, channel_title, channel_country,
                                     thumbnail_url, view_count, like_count, published_at, views_per_hour, fetched_at)
  select r.country_code, r.rank, r.video_id, r.title, r.channel_id, r.channel_title, r.channel_country,
         r.thumbnail_url, r.view_count, r.like_count, r.published_at, r.views_per_hour, now()
    from jsonb_to_recordset(videos) as r(country_code text, rank smallint, video_id text, title text, channel_id text,
                                         channel_title text, channel_country text, thumbnail_url text, view_count bigint,
                                         like_count bigint, published_at timestamptz, views_per_hour bigint);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_fashion_videos(jsonb) from public, anon, authenticated;
grant execute on function public.replace_fashion_videos(jsonb) to service_role;

alter table public.fashion_videos enable row level security;
drop policy if exists "Public read access" on public.fashion_videos;
create policy "Public read access" on public.fashion_videos for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.fashion_videos from anon, authenticated;
grant select on public.fashion_videos to anon, authenticated;
grant select, insert, update, delete on public.fashion_videos to service_role;
