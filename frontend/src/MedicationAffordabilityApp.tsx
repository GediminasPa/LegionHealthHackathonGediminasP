import { useEffect, useMemo, useState } from "react";
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
    if (healthError) return "API down";
    if (health?.db === "ok") return "API + DB ok";
    if (health) return "DB unavailable";
    return "Checking";
  }, [health, healthError]);

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

  return (
    <div className="min-h-screen bg-[#f7f7f3] text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-700">
              medication affordability
            </p>
            <h1 className="text-lg font-semibold tracking-normal sm:text-xl">
              Investigation workspace
            </h1>
          </div>
          <span
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium ${
              healthError
                ? "border-red-200 bg-red-50 text-red-700"
                : health?.db === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {apiLabel}
          </span>
        </div>
      </header>

      {snapshot ? (
        <MedicationWorkspace snapshot={snapshot} setSnapshot={setSnapshot} />
      ) : (
        <MedicationIntake
          initialIntake={blankMedicationIntake()}
          onSessionStarted={(sessionId, intake) => {
            setSnapshot(createLocalSnapshot(sessionId, intake));
          }}
        />
      )}
    </div>
  );
}
