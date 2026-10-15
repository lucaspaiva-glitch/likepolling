-- Let the Creator News Wire store European Portuguese headlines ('pt-PT',
-- Google News Portugal) next to the existing languages. Only widens the
-- language check; existing rows are untouched.
alter table public.news_wire drop constraint if exists news_wire_lang_check;
alter table public.news_wire
  add constraint news_wire_lang_check
  check (lang in ('en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja'));
