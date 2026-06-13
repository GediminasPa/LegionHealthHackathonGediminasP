import { TrendingDown, WalletCards } from "lucide-react";
import type { CostTrackerState } from "./medicationTypes";

export default function CostTracker({ tracker }: { tracker: CostTrackerState }) {
  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-[#f7f2ec]">
            <WalletCards size={16} />
            Cost tracker
          </h2>
          <p className="ui-sans mt-1 text-sm leading-6 text-[#c7c0b8]">{tracker.currentBestLabel}</p>
        </div>
        <div className="rounded-2xl border border-white/14 bg-white/5 px-4 py-3 text-right">
          <div className="ui-sans text-xs font-semibold text-[#c7c0b8]">Quote</div>
          <div className="text-2xl font-semibold text-[#f7f2ec]">{formatCents(tracker.quotedPriceCents)}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Best estimate" value={formatMaybeCents(tracker.currentBestEstimatedPriceCents)} />
        <Metric label="Potential drop" value={formatMaybeCents(tracker.potentialDropCents)} tone="success" />
        <Metric label="Path type" value={labelize(tracker.dropType)} />
      </div>
      <div className="ui-sans mt-4 flex items-start gap-3 rounded-2xl border border-[#ef6844]/35 bg-[#3a302c] px-4 py-3 text-sm leading-6 text-[#ffd5c9]">
        <TrendingDown className="mt-1 shrink-0 text-[#ef6844]" size={16} />
        <p>{tracker.explanation}</p>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success";
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3">
      <div className="ui-sans text-xs font-semibold text-[#c7c0b8]">{label}</div>
      <div className={`mt-1 text-base font-semibold ${tone === "success" ? "text-[#76d7a6]" : "text-[#f7f2ec]"}`}>
        {value}
      </div>
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
