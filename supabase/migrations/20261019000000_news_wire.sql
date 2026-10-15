-- Creator News Wire: latest Google News headlines about YouTube and creators,
-- per site language (en/pt/es). Written hourly by scripts/news-wire-routine.js
-- through replace_news_wire() (secret key only); readable with the publishable key.

create table if not exists public.news_wire (
  lang          text        not null check (lang in ('en', 'pt', 'es')),
  link          text        not null,
  category      text        not null check (category in ('youtube', 'creators')),
  title         text        not null,
  source        text,
  published_at  timestamptz not null,
  fetched_at    timestamptz not null default now(),
  primary key (lang, link)
);

create index if not exists news_wire_lang_published_idx on public.news_wire (lang, published_at desc);

-- Replaces every language present in the payload in one transaction, so a
-- language whose feeds failed keeps its previous headlines.
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

  insert into public.news_wire (lang, link, category, title, source, published_at, fetched_at)
  select r.lang, r.link, r.category, r.title, r.source, r.published_at, now()
    from jsonb_to_recordset(payload) as r(lang text, link text, category text, title text, source text, published_at timestamptz)
  on conflict (lang, link) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.replace_news_wire(jsonb) from public, anon, authenticated;
grant execute on function public.replace_news_wire(jsonb) to service_role;

alter table public.news_wire enable row level security;
drop policy if exists "Public read access" on public.news_wire;
create policy "Public read access" on public.news_wire for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.news_wire from anon, authenticated;
grant select on public.news_wire to anon, authenticated;
