-- Daily balance history per account (one row per account per day), used for portfolio performance.
create table if not exists public.balance_snapshots (
  account_id uuid not null references public.accounts(id) on delete cascade,
  date date not null,
  balance numeric not null,
  primary key (account_id, date)
);

alter table public.balance_snapshots enable row level security;
revoke all on public.balance_snapshots from anon, authenticated;
grant select, insert, update, delete on public.balance_snapshots to service_role;

-- Start tracking from today's balances.
insert into public.balance_snapshots (account_id, date, balance)
select id, current_date, balance from public.accounts
on conflict (account_id, date) do nothing;
