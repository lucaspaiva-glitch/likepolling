-- Memory: yearly sales and net profit of every company that files with the US SEC (EDGAR XBRL "frames", public data).
--   company_financials  One row per company (SEC CIK) and business year. The year is the year the business
--                       year ended. Sales use the first SEC concept the company reports, in this order:
--                       RevenueFromContractWithCustomerExcludingAssessedTax, Revenues, SalesRevenueNet,
--                       RevenueFromContractWithCustomerIncludingAssessedTax. Profit is NetIncomeLoss.
-- Filled weekly by scripts/sec-routine.js and kept as history. Read by the Company report. Public read.
create table if not exists public.company_financials (
  cik         integer not null check (cik > 0),
  year        smallint not null check (year between 1990 and 2100),
  name        text not null,
  period_end  date not null,
  revenue     bigint,
  profit      bigint,
  updated_at  timestamptz not null default now(),
  primary key (cik, year)
);
create index if not exists company_financials_year on public.company_financials (year);

create or replace function public.upsert_company_financials(payload jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare n integer;
begin
  insert into public.company_financials as t (cik, year, name, period_end, revenue, profit, updated_at)
  select r.cik, r.year, r.name, r.period_end, r.revenue, r.profit, now()
    from jsonb_to_recordset(payload) as r(cik integer, year smallint, name text, period_end date, revenue bigint, profit bigint)
  on conflict (cik, year) do update set name = excluded.name, period_end = excluded.period_end,
    revenue = coalesce(excluded.revenue, t.revenue), profit = coalesce(excluded.profit, t.profit), updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

alter table public.company_financials enable row level security;
drop policy if exists "Public read access" on public.company_financials;
create policy "Public read access" on public.company_financials for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.company_financials from anon, authenticated;
grant select on public.company_financials to anon, authenticated;
grant select, insert, update, delete on public.company_financials to service_role;
revoke execute on function public.upsert_company_financials(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_company_financials(jsonb) to service_role;
