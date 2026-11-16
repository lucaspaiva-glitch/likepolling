-- Fashion News left the site and its job no longer runs on a schedule: stop copying the
-- frozen news_fashion rows into news_archive. Fashion rows already archived stay.
create or replace function public.archive_news()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.news_archive as a (section, country_code, link, title, title_en, summary_en, title_tr, source, published_at, best_rank)
  select distinct on (s.section, s.country_code, s.link) s.section, s.country_code, s.link, s.title,
         nullif(s.title_tr->>'en', ''), nullif(s.title_tr->'sum'->>'en', ''), s.title_tr, s.source, s.published_at, s.rank
  from (
    select 'world' section, t.country_code, t.link, t.title, t.title_tr, t.source, t.published_at, t.rank from public.news_world t where t.rank <= 10
    union all select 'ai', t.country_code, t.link, t.title, t.title_tr, t.source, t.published_at, t.rank from public.news_ai t where t.rank <= 10
  ) s
  order by s.section, s.country_code, s.link, s.rank
  on conflict (section, country_code, link) do update
    set last_seen = now(),
        best_rank = least(a.best_rank, excluded.best_rank),
        title_en = coalesce(excluded.title_en, a.title_en),
        summary_en = coalesce(excluded.summary_en, a.summary_en),
        title_tr = coalesce(excluded.title_tr, a.title_tr);
end;
$$;
revoke execute on function public.archive_news() from public, anon, authenticated;
grant execute on function public.archive_news() to service_role;
