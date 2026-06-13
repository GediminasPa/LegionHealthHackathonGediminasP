import { useEffect, useMemo, useState } from "react";
import { Activity, HeartPulse } from "lucide-react";
import { getHealth, type Health } from "./api";
import MedicationIntake from "./MedicationIntake";
import MedicationWorkspace from "./MedicationWorkspace";
import {
  blankMedicationIntake,
  initialCostTracker,
  type MedicationIntakeData,
  type MedicationSnapshot,
} from "./medicationTypes";

export default function MedicationAffordabilityApp() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [snapshot, setSnapshot] = useState<MedicationSnapshot | null>(null);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  const apiLabel = useMemo(() => {
    if (healthError) return "API unavailable";
    if (health?.db === "ok") return "API and DB ready";
    if (health) return "Database unavailable";
    return "Checking connection";
  }, [health, healthError]);

  const apiTone = healthError
    ? "border-[#ff8a7c]/35 bg-[#4a2723] text-[#ffd9d3]"
    : health?.db === "ok"
      ? "border-[#76d7a6]/35 bg-[#213a30] text-[#a9f0c8]"
      : "border-[#ffc36a]/35 bg-[#463820] text-[#ffe0a8]";

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
          apiLabel={apiLabel}
          apiTone={apiTone}
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
      <header className="sticky top-0 z-20 border-b border-white/12 bg-[#1f1e1d]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#ef6844] bg-[#2f2926] text-[#ef6844]">
              <HeartPulse size={21} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="ui-sans text-xs font-semibold text-[#ef6844]">Medication affordability</p>
              <h1 className="truncate text-lg font-semibold tracking-normal text-[#f7f2ec] sm:text-xl">
                <span className="sm:hidden">Case review</span>
                <span className="hidden sm:inline">Case investigation</span>
              </h1>
            </div>
          </div>
          <span
            className={`ui-sans inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${apiTone}`}
          >
            <Activity size={13} />
            {apiLabel}
          </span>
        </div>
      </header>

      <MedicationWorkspace snapshot={snapshot} setSnapshot={setSnapshot} />
    </div>
  );
}
