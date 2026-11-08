-- How much a person or brand was talked about (last 30 days) each time a report is built: news articles
-- worldwide (GDELT) and public Bluesky posts, counts only. Written by /api/report with the service key.
create table if not exists public.mentions_daily (
  day             date    not null,
  subject         text    not null check (length(subject) between 1 and 120),
  news_articles   integer,
  news_countries  jsonb,
  posts           integer,
  post_likes      integer,
  post_langs      jsonb,
  primary key (day, subject)
);
alter table public.mentions_daily enable row level security;
revoke all on public.mentions_daily from anon, authenticated;
grant all on public.mentions_daily to service_role;
