-- News about each tracked person or brand, per day: articles worldwide and their average tone
-- (GDELT DOC API, -10 very negative .. +10 very positive). Filled daily by scripts/news-mentions-routine.js.
create table if not exists public.news_mentions_daily (
  day       date    not null,
  subject   text    not null check (length(subject) between 1 and 120),
  articles  integer not null default 0,
  tone      real,
  primary key (day, subject)
);
create index if not exists news_mentions_daily_subject on public.news_mentions_daily (subject, day desc);
alter table public.news_mentions_daily enable row level security;
revoke all on public.news_mentions_daily from anon, authenticated;
grant all on public.news_mentions_daily to service_role;
