import { ClipboardList, FilePlus2, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { createMedicationSession, getMedicationDemoCases } from "./api";
import type { DemoCase, MedicationIntakeData, PaStatus } from "./medicationTypes";

type Props = {
  initialIntake: MedicationIntakeData;
  onSessionStarted: (sessionId: string, intake: MedicationIntakeData) => void;
};

export default function MedicationIntake({ initialIntake, onSessionStarted }: Props) {
  const [intake, setIntake] = useState(initialIntake);
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getMedicationDemoCases()
      .then(setDemoCases)
      .catch(() => setDemoCases([]));
  }, []);

  async function startInvestigation(nextIntake = intake) {
    setError(null);
    setSubmitting(true);
    try {
      const { sessionId } = await createMedicationSession(nextIntake);
      onSessionStarted(sessionId, nextIntake);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the case.");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof MedicationIntakeData>(key: K, value: MedicationIntakeData[K]) {
    setIntake((current) => ({ ...current, [key]: value }));
  }

  const requiredMissing =
    !intake.patientName.trim() ||
    !intake.state.trim() ||
    !intake.medicationName.trim() ||
    intake.quotedPriceCents <= 0 ||
    !intake.insuranceType.trim();

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
      <section className="space-y-3">
        <button
          className="inline-flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium hover:bg-stone-50"
          type="button"
          onClick={() => setIntake(initialIntake)}
        >
          <FilePlus2 size={16} />
          Start blank case
        </button>
        {demoCases.map((demo) => (
          <button
            className="block w-full rounded-md border border-stone-300 bg-white p-4 text-left hover:border-teal-600 hover:bg-teal-50"
            key={demo.id}
            type="button"
            onClick={() => setIntake(demo.intake)}
          >
            <span className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-stone-950">
              <ClipboardList size={16} />
              {demo.title}
            </span>
            <span className="block text-sm leading-6 text-stone-600">{demo.summary}</span>
          </button>
        ))}
      </section>

      <form
        className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void startInvestigation();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Patient">
            <input
              className="input"
              value={intake.patientName}
              onChange={(event) => update("patientName", event.target.value)}
            />
          </Field>
          <Field label="State">
            <input
              className="input"
              value={intake.state}
              onChange={(event) => update("state", event.target.value)}
            />
          </Field>
          <Field label="Medication">
            <input
              className="input"
              value={intake.medicationName}
              onChange={(event) => update("medicationName", event.target.value)}
            />
          </Field>
          <Field label="Strength">
            <input
              className="input"
              value={intake.strength}
              onChange={(event) => update("strength", event.target.value)}
            />
          </Field>
          <Field label="Dose">
            <input
              className="input"
              value={intake.dose}
              onChange={(event) => update("dose", event.target.value)}
            />
          </Field>
          <Field label="Quoted price">
            <input
              className="input"
              min={0}
              step={1}
              type="number"
              value={Math.round(intake.quotedPriceCents / 100)}
              onChange={(event) =>
                update("quotedPriceCents", Math.max(Number(event.target.value || 0) * 100, 0))
              }
            />
          </Field>
          <Field label="Insurance">
            <select
              className="input"
              value={intake.insuranceType}
              onChange={(event) => update("insuranceType", event.target.value)}
            >
              <option>Commercial</option>
              <option>Medicare Part D</option>
              <option>Medicaid</option>
              <option>Cash pay</option>
              <option>Other</option>
            </select>
          </Field>
          <Field label="PA status">
            <select
              className="input"
              value={intake.paStatus}
              onChange={(event) => update("paStatus", event.target.value as PaStatus)}
            >
              <option value="approved">approved</option>
              <option value="pending">pending</option>
              <option value="denied">denied</option>
              <option value="unknown">unknown</option>
            </select>
          </Field>
          <Field label="Plan name">
            <input
              className="input"
              value={intake.planName}
              onChange={(event) => update("planName", event.target.value)}
            />
          </Field>
          <Field label="Plan ID">
            <input
              className="input"
              value={intake.planId}
              onChange={(event) => update("planId", event.target.value)}
            />
          </Field>
          <Field label="Diagnosis">
            <input
              className="input"
              value={intake.diagnosis}
              onChange={(event) => update("diagnosis", event.target.value)}
            />
          </Field>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-stone-700">Pasted plan/pharmacy text</span>
            <textarea
              className="input min-h-28 resize-y"
              value={intake.pastedText}
              onChange={(event) => update("pastedText", event.target.value)}
            />
          </label>
        </div>
        {error ? <p className="mt-4 text-sm font-medium text-red-700">{error}</p> : null}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
            disabled={requiredMissing || submitting}
            type="submit"
          >
            <Play size={16} />
            Start Investigation
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50"
            type="button"
            onClick={() => setIntake(initialIntake)}
          >
            <RotateCcw size={16} />
            Reset
          </button>
        </div>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}
