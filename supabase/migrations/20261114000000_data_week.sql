-- Data of the week: the latest TidyTuesday dataset (github.com/rfordatascience/tidytuesday, CC0), shown as a
-- plain-words lesson in the Education section. Filled weekly by scripts/data-week-routine.js; public read.
create table if not exists public.data_week (
  week          date primary key,
  title         text not null,
  summary       text not null,
  questions     jsonb not null default '[]',
  source_title  text,
  source_url    text,
  folder_url    text not null,
  image_url     text,
  image_alt     text,
  fetched_at    timestamptz not null default now()
);
alter table public.data_week enable row level security;
drop policy if exists "Public read access" on public.data_week;
create policy "Public read access" on public.data_week for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.data_week from anon, authenticated;
grant select on public.data_week to anon, authenticated;
grant all on public.data_week to service_role;

-- Saves one week and keeps the last 12.
create or replace function public.upsert_data_week(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
begin
  insert into public.data_week as t (week, title, summary, questions, source_title, source_url, folder_url, image_url, image_alt, fetched_at)
  select r.week, r.title, r.summary, coalesce(r.questions, '[]'), r.source_title, r.source_url, r.folder_url, r.image_url, r.image_alt, now()
    from jsonb_to_record(payload) as r(week date, title text, summary text, questions jsonb, source_title text, source_url text, folder_url text, image_url text, image_alt text)
  on conflict (week) do update set title = excluded.title, summary = excluded.summary, questions = excluded.questions,
    source_title = excluded.source_title, source_url = excluded.source_url, folder_url = excluded.folder_url,
    image_url = excluded.image_url, image_alt = excluded.image_alt, fetched_at = now();
  delete from public.data_week where week not in (select week from public.data_week order by week desc limit 12);
  return 1;
end;
$$;
