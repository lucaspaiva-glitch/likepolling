-- Fashion News is gone from the site and no report uses it: erase its headlines and archived copies.
delete from public.news_archive where section = 'fashion';
drop function if exists public.replace_news_fashion(jsonb);
drop table if exists public.news_fashion;
