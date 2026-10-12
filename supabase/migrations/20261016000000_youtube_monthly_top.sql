-- "Most Viewed This Month" widget: per country, the 10 most-viewed videos uploaded
-- since the 1st of the current month (UTC). Only the newest snapshot is kept
-- (written daily by scripts/monthly-top-routine.js). Additive: changes nothing else.
create table if not exists public.youtube_monthly_top (
  country_code   char(2)     not null,
  rank           smallint    not null check (rank between 1 and 50),
  video_id       text        not null,
  title          text        not null,
  channel_id     text        not null,
  channel_title  text        not null,
  thumbnail_url  text,
  view_count     bigint,
  like_count     bigint,
  published_at   timestamptz,
  period_start   date        not null,
  fetched_at     timestamptz not null default now(),
  primary key (country_code, rank)
);

-- Replaces the snapshot for every country in the payload in one transaction,
-- and drops countries that are no longer in the routine's list (tracked).
create or replace function public.replace_youtube_monthly_top(payload jsonb, tracked text[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.youtube_monthly_top t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(payload) e)
      or not (t.country_code = any(tracked));

  insert into public.youtube_monthly_top (country_code, rank, video_id, title, channel_id, channel_title,
                                          thumbnail_url, view_count, like_count, published_at,
                                          period_start, fetched_at)
  select r.country_code, r.rank, r.video_id, r.title, r.channel_id, r.channel_title,
         r.thumbnail_url, r.view_count, r.like_count, r.published_at, r.period_start, now()
    from jsonb_to_recordset(payload) as r(country_code char(2), rank smallint, video_id text, title text,
                                          channel_id text, channel_title text, thumbnail_url text,
                                          view_count bigint, like_count bigint, published_at timestamptz,
                                          period_start date);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_youtube_monthly_top(jsonb, text[]) from public, anon, authenticated;
grant execute on function public.replace_youtube_monthly_top(jsonb, text[]) to service_role;

alter table public.youtube_monthly_top enable row level security;
drop policy if exists "Public read access" on public.youtube_monthly_top;
create policy "Public read access" on public.youtube_monthly_top for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.youtube_monthly_top from anon, authenticated;
grant select on public.youtube_monthly_top to anon, authenticated;
