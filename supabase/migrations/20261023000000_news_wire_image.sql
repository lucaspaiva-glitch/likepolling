-- Creator News Wire: each article's own preview image (its og:image), found by
-- scripts/news-wire-routine.js. Adds one nullable column and lets
-- replace_news_wire() store it. Existing headlines and columns are kept;
-- an empty string means the article was checked and has no usable image.

alter table public.news_wire add column if not exists image_url text;

create or replace function public.replace_news_wire(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.news_wire t
   where t.lang in (select distinct e->>'lang' from jsonb_array_elements(payload) e);

  insert into public.news_wire (lang, link, category, title, source, published_at, fetched_at, image_url)
  select r.lang, r.link, r.category, r.title, r.source, r.published_at, now(), r.image_url
    from jsonb_to_recordset(payload) as r(lang text, link text, category text, title text, source text, published_at timestamptz, image_url text)
  on conflict (lang, link) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_wire(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_wire(jsonb) to service_role;
