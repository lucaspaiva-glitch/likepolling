-- Optional YouTube video on an ad card: the 11-character video id, played inside the card like the site's other videos.
alter table public.sponsors add column if not exists video text check (video ~ '^[A-Za-z0-9_-]{11}$');
