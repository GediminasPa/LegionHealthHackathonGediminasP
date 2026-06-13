import { useEffect, useRef, useState } from "react";
import { FilePlus2 } from "lucide-react";
import { PRODUCT_LOGO_SRC, PRODUCT_NAME } from "./brand";
import { formatCents } from "./CostTracker";
import MedicationIntake from "./MedicationIntake";
import MedicationWorkspace from "./MedicationWorkspace";
import {
  blankMedicationIntake,
  initialCostTracker,
  type CostTrackerState,
  type MedicationIntakeData,
  type MedicationSnapshot,
} from "./medicationTypes";

export default function MedicationAffordabilityApp() {
  const [snapshot, setSnapshot] = useState<MedicationSnapshot | null>(null);

  function createLocalSnapshot(sessionId: string, intake: MedicationIntakeData): MedicationSnapshot {
    return {
      sessionId,
      intake,
      messages: [],
      costTracker: initialCostTracker(intake),
      activities: [],
      options: [],
      sources: [],
      artifacts: [],
      flags: [],
      status: "intake",
    };
  }

  if (!snapshot) {
    return (
      <div className="min-h-[100dvh] bg-[#1f1e1d] text-[#f7f2ec]">
        <MedicationIntake
          initialIntake={blankMedicationIntake()}
          onSessionStarted={(sessionId, intake) => {
            setSnapshot(createLocalSnapshot(sessionId, intake));
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#1f1e1d] text-[#f7f2ec]">
      <header className="sticky top-0 z-20 border-b border-white/12 bg-[#1f1e1d]">
        <div className="mx-auto flex min-h-20 max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:flex-nowrap lg:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <button
              className="button-press shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ef6844]"
              type="button"
              onClick={() => setSnapshot(null)}
              aria-label="Return to initial page"
            >
              <img
                className="h-20 w-20 object-contain drop-shadow-[0_0_1px_rgb(247_242_236/0.65)]"
                src={PRODUCT_LOGO_SRC}
                alt=""
              />
            </button>
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-[-0.05em] text-[#f7f2ec]">{PRODUCT_NAME}</p>
              <h1 className="ui-sans truncate text-xs font-semibold uppercase tracking-[0.12em] text-[#c7c0b8]">
                <span className="sm:hidden">Case review</span>
                <span className="hidden sm:inline">Case investigation</span>
              </h1>
            </div>
          </div>
          <HeaderPriceSignals tracker={snapshot.costTracker} />
          <button
            className="button-press ui-sans inline-flex min-h-11 shrink-0 items-center gap-2 border border-white/12 bg-[#302e2c] px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#f7f2ec] hover:border-[#ef6844]/70"
            type="button"
            onClick={() => setSnapshot(null)}
          >
            <FilePlus2 size={16} />
            <span className="hidden sm:inline">New case</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <MedicationWorkspace snapshot={snapshot} setSnapshot={setSnapshot} />
    </div>
  );
}

function HeaderPriceSignals({ tracker }: { tracker: CostTrackerState }) {
  const bestPriceCents = tracker.currentBestEstimatedPriceCents ?? tracker.quotedPriceCents;
  const [displayBestCents, setDisplayBestCents] = useState(bestPriceCents);
  const [cutPriceCents, setCutPriceCents] = useState<number | null>(null);
  const clearCutTimeout = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    if (bestPriceCents < displayBestCents) {
      if (clearCutTimeout.current) window.clearTimeout(clearCutTimeout.current);
      setCutPriceCents(displayBestCents);
      setDisplayBestCents(bestPriceCents);
      clearCutTimeout.current = window.setTimeout(() => {
        setCutPriceCents(null);
        clearCutTimeout.current = null;
      }, 1100);
      return;
    }

    if (bestPriceCents > displayBestCents) {
      if (clearCutTimeout.current) window.clearTimeout(clearCutTimeout.current);
      setCutPriceCents(null);
      setDisplayBestCents(bestPriceCents);
    }
  }, [bestPriceCents, displayBestCents]);

  useEffect(() => {
    return () => {
      if (clearCutTimeout.current) window.clearTimeout(clearCutTimeout.current);
    };
  }, []);

  return (
    <div className="ui-sans order-3 flex w-full min-w-0 items-center gap-6 text-sm font-semibold uppercase tracking-[0.08em] sm:order-none sm:mx-auto sm:w-auto sm:flex-1 sm:justify-center">
      <div className="min-w-0 text-[#c7c0b8]">
        <span>
          Quote
        </span>
        <span className="price-quote-pulse ml-2">
          {formatCents(tracker.quotedPriceCents)}
        </span>
      </div>
      <div className="min-w-0 text-[#c7c0b8]">
        <span>
          Best
        </span>
        <span className="ml-2 inline-grid align-baseline">
          {cutPriceCents == null ? (
            <span className="price-best-value">{formatCents(displayBestCents)}</span>
          ) : (
            <>
              <span className="price-cut-old">{formatCents(cutPriceCents)}</span>
              <span className="price-new-arrive">{formatCents(displayBestCents)}</span>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
