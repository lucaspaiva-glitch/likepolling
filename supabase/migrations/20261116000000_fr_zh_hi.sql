-- French, Chinese and Hindi site languages: widen the language checks of the
-- per-language Creator News Wire and Popular Shorts tables. Existing rows are untouched.
alter table public.news_wire drop constraint if exists news_wire_lang_check;
alter table public.news_wire
  add constraint news_wire_lang_check
  check (lang in ('en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja', 'fr', 'zh', 'hi'));
alter table public.news_shorts drop constraint if exists news_shorts_lang_check;
alter table public.news_shorts
  add constraint news_shorts_lang_check
  check (lang in ('en', 'pt', 'pt-PT', 'es', 'de', 'ru', 'uk', 'ko', 'ja', 'fr', 'zh', 'hi'));
