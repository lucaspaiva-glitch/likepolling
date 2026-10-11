-- Restrict the public (anon/publishable) key to read-only access.
-- The backend (api/metrics.js) and worker.py use the secret key (service_role),
-- which bypasses RLS and keeps full write access.
begin;

alter table public.platform_disclosures enable row level security;
alter table public.entities             enable row level security;
alter table public.entity_metrics       enable row level security;

-- Remove any pre-existing (possibly permissive) policies on these tables.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('platform_disclosures', 'entities', 'entity_metrics')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy "Public read access" on public.platform_disclosures for select to anon, authenticated using (true);
create policy "Public read access" on public.entities             for select to anon, authenticated using (true);
create policy "Public read access" on public.entity_metrics       for select to anon, authenticated using (true);

-- Defense in depth: no write privileges for public roles even if RLS is ever disabled.
revoke insert, update, delete, truncate on public.platform_disclosures, public.entities, public.entity_metrics from anon, authenticated;
grant select on public.platform_disclosures, public.entities, public.entity_metrics to anon, authenticated;

commit;
