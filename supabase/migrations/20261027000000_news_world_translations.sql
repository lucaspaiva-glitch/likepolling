-- World News Wire: each headline translated into the 9 site languages (Gemini),
-- stored as {"en": "...", "pt": "...", ...}. Adds one nullable column and lets
-- replace_news_world() store it; existing rows and columns are kept.
alter table public.news_world add column if not exists title_tr jsonb;

create or replace function public.replace_news_world(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.news_world t
   where t.country_code in (select distinct e->>'country_code' from jsonb_array_elements(payload) e);

  insert into public.news_world (country_code, link, rank, title, source, published_at, image_url, title_tr, fetched_at)
  select r.country_code, r.link, r.rank, r.title, r.source, r.published_at, r.image_url, r.title_tr, now()
    from jsonb_to_recordset(payload) as r(country_code text, link text, rank integer, title text, source text, published_at timestamptz, image_url text, title_tr jsonb)
  on conflict (country_code, link) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_world(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_world(jsonb) to service_role;
