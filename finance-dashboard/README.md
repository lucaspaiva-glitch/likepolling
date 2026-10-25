# Finance Dashboard

Private, desktop-first personal finance telemetry: net worth / allocation, monthly income vs. burn,
category breakdown, and an editable transactions table. Data comes from Plaid (Bank of America,
Merrill Lynch) with a CSV import fallback, stored in Supabase.

Stack: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Tremor · Supabase · Plaid.

This app lives in its own folder and is independent from the Like Polling site at the repo root.

## 1. Environment variables

```bash
cd finance-dashboard
cp .env.local.example .env.local   # then fill in the values
```

| Variable | Where to find it | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | server + browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API keys → anon / publishable key | browser client (no table access, see below) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API keys → service_role / secret key | server only (pages + API routes) |
| `PLAID_CLIENT_ID` | dashboard.plaid.com → Developers → Keys | server only |
| `PLAID_SECRET` | same page, secret for the chosen environment | server only |
| `PLAID_ENV` | `sandbox` (default) or `production` | server only |
| `DASHBOARD_BASIC_AUTH` | optional, `user:password`; enables HTTP Basic Auth on every route | middleware |

`.env.local` is git-ignored. Never commit real keys.

## 2. Database migration

Run `supabase/migrations/0001_init.sql` once against your Supabase project:

- **SQL Editor:** Supabase dashboard → SQL Editor → New query → paste the file → Run.
- **or CLI:** `supabase link --project-ref <ref> && supabase db push` from this folder.

It creates `accounts`, `transactions` (indexed on `date`, `category`, `account_id`) and `plaid_items`
(Plaid access tokens + sync cursor). Row Level Security is enabled with no policies and the
`anon`/`authenticated` roles have no grants, so the public anon key cannot read your finances. All
reads and writes go through the server with the service role key.

## 3. Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build check
```

## Ingestion

**Plaid (primary).** "Connect BofA / Merrill" fetches a link token (`/api/plaid/create-link-token`),
opens Plaid Link, exchanges the public token (`/api/plaid/exchange-token`, stored in `plaid_items`),
then runs `/api/plaid/sync`. "Sync now" re-runs the sync for every linked institution: balances
come from `/accounts/get`, transactions from `/transactions/sync` (incremental, cursor saved per
item). Link requests `transactions` and, where supported (Merrill), `investments` as an optional
product. In sandbox use `user_good` / `pass_good`. Production access requires Plaid approval, and
each linked item is billed by Plaid.

**CSV (fallback).** Drop a Bank of America (checking/savings or credit card) or Merrill Lynch
activity export on the CSV card. It is parsed in the browser (papaparse): the header row is
detected automatically (BofA's summary block is skipped), dates/amounts are normalised (`$`, commas,
parentheses = negative), and you pick an existing account or create one. BofA's `Running Bal.`
updates the account balance. Re-importing the same file does not create duplicates.

**Auto-categorisation.** Inflows whose payee contains "Merrill" or "BRK" are categorised as
`Investments` (both Plaid and CSV). Other rows use Plaid's category or simple keyword rules. Click
any category in the transactions table to change it; edits are saved to Supabase and are kept on
later Plaid syncs.

## Conventions

- `amount`: inflows positive, outflows negative. `type` is `income` or `expense`.
- `accounts.type`: `cash`, `investment`, `credit`, `loan`, `other`. Credit and loan balances are
  stored as negative numbers and count as liabilities in net worth.
- The dashboard loads the trailing 12 months of transactions, paging past PostgREST's 1,000-row cap.
