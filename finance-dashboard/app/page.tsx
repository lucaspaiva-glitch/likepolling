import AccountsTable from "@/components/AccountsTable";
import AllocationChart from "@/components/AllocationChart";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import CsvDropzone from "@/components/CsvDropzone";
import KpiStrip from "@/components/KpiStrip";
import PlaidConnect from "@/components/PlaidConnect";
import PortfolioChart from "@/components/PortfolioChart";
import TransactionsTable from "@/components/TransactionsTable";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const data = await getDashboardData();

  return (
    <main className="mx-auto max-w-[1680px] space-y-2 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold text-dark-tremor-content-strong sm:text-base">Vault</h1>
          <span className="text-[11px] text-dark-tremor-content-subtle">
            {data.lastUpdated ? `Balances as of ${new Date(data.lastUpdated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Europe/Lisbon" })}` : "No data yet"}
          </span>
        </div>
        <PlaidConnect />
      </header>

      {!data.configured && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Supabase is not configured. Fill in <code>.env.local</code> (see <code>.env.local.example</code>), run{" "}
          <code>supabase/migrations/0001_init.sql</code> in the Supabase SQL Editor, then restart <code>npm run dev</code>.
        </div>
      )}
      {data.error && (
        <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          Supabase error: {data.error}. Has the migration <code>supabase/migrations/0001_init.sql</code> been run?
        </div>
      )}

      <KpiStrip kpis={data.kpis} />

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="order-3 lg:order-1 lg:col-span-3">
          <AllocationChart data={data.allocation} netWorth={data.kpis.netWorth} />
        </div>
        <div className="order-2 lg:col-span-6">
          <PortfolioChart data={data.portfolioSeries} ready={data.snapshotsReady} />
        </div>
        <div className="order-1 lg:order-3 lg:col-span-3">
          <AccountsTable accounts={data.accounts} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
        <div className="lg:col-span-9">
          <CategoryBreakdown categories={data.categories} />
        </div>
        <div className="lg:col-span-3">
          <CsvDropzone accounts={data.accounts} />
        </div>
      </div>

      <TransactionsTable transactions={data.transactions} accounts={data.accounts} />
    </main>
  );
}
