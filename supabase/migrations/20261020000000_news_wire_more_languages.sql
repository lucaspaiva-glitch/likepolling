-- Creator News Wire: allow the five new site languages (German, Russian,
-- Ukrainian, Korean, Japanese). Only widens the news_wire.lang check; no data
-- or other table is touched.
alter table public.news_wire drop constraint if exists news_wire_lang_check;
alter table public.news_wire add constraint news_wire_lang_check
  check (lang in ('en', 'pt', 'es', 'de', 'ru', 'uk', 'ko', 'ja'));
