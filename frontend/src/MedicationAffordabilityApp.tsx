import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { PRODUCT_LOGO_SRC, PRODUCT_NAME } from "./brand";
import MedicationIntake from "./MedicationIntake";
import MedicationWorkspace from "./MedicationWorkspace";
import {
  blankMedicationIntake,
  initialCostTracker,
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
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <img
              className="h-12 w-12 shrink-0 object-contain drop-shadow-[0_0_1px_rgb(247_242_236/0.65)]"
              src={PRODUCT_LOGO_SRC}
              alt={`${PRODUCT_NAME} logo`}
            />
            <div className="min-w-0">
              <p className="text-2xl font-bold tracking-[-0.05em] text-[#f7f2ec]">{PRODUCT_NAME}</p>
              <h1 className="ui-sans truncate text-xs font-semibold uppercase tracking-[0.12em] text-[#c7c0b8]">
                <span className="sm:hidden">Case review</span>
                <span className="hidden sm:inline">Case investigation</span>
              </h1>
            </div>
          </div>
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
