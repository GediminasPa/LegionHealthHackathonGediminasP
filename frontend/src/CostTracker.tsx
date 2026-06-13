import { TrendingDown, WalletCards } from "lucide-react";
import type { CostTrackerState } from "./medicationTypes";

export default function CostTracker({ tracker }: { tracker: CostTrackerState }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
            <WalletCards size={16} />
            Cost tracker
          </h2>
          <p className="mt-1 text-sm text-stone-600">{tracker.currentBestLabel}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
            quote
          </div>
          <div className="text-2xl font-semibold">{formatCents(tracker.quotedPriceCents)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="best estimate" value={formatMaybeCents(tracker.currentBestEstimatedPriceCents)} />
        <Metric label="potential drop" value={formatMaybeCents(tracker.potentialDropCents)} />
        <Metric label="type" value={labelize(tracker.dropType)} />
      </div>
      <p className="mt-4 rounded-md bg-teal-50 px-3 py-2 text-sm leading-6 text-teal-950">
        <TrendingDown className="mr-2 inline" size={15} />
        {tracker.explanation}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-stone-950">{value}</div>
    </div>
  );
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatMaybeCents(cents: number | null): string {
  return cents == null ? "unknown" : formatCents(cents);
}

function labelize(value: string): string {
  return value.replaceAll("_", " ");
}
