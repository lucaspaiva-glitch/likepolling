-- Finance dashboard schema. Run once in the Supabase SQL Editor (or `supabase db push`).
-- All access goes through the server (service role key). RLS is enabled with no
-- policies, so the anon/publishable key cannot read or write any of these tables.

create extension if not exists pgcrypto;

create table if not exists public.plaid_items (
  id uuid primary key default gen_random_uuid(),
  item_id text not null unique,
  access_token text not null,
  institution text,
  institution_id text,
  cursor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'cash', -- cash | investment | credit | loan | other
  institution text,
  balance numeric not null default 0, -- liabilities stored as negative numbers
  currency text not null default 'USD',
  external_id text unique,            -- Plaid account_id, or csv:<institution>:<name>
  plaid_item_id uuid references public.plaid_items(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  date date not null,
  payee text,
  amount numeric not null,            -- inflow positive, outflow negative
  category text,
  type text,                          -- income | expense
  raw_data jsonb,
  external_id text unique,            -- Plaid transaction_id, or csv:<sha1>
  created_at timestamptz not null default now()
);

create index if not exists transactions_date_idx on public.transactions(date);
create index if not exists transactions_category_idx on public.transactions(category);
create index if not exists transactions_account_id_idx on public.transactions(account_id);

alter table public.plaid_items enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

revoke all on public.plaid_items, public.accounts, public.transactions from anon, authenticated;
grant select, insert, update, delete on public.plaid_items, public.accounts, public.transactions to service_role;
