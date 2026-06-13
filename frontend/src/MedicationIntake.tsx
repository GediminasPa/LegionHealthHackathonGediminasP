import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createMedicationSession, getMedicationDemoCases } from "./api";
import type { DemoCase, MedicationIntakeData, PaStatus } from "./medicationTypes";

type Props = {
  apiLabel: string;
  apiTone: string;
  initialIntake: MedicationIntakeData;
  onSessionStarted: (sessionId: string, intake: MedicationIntakeData) => void;
};

export default function MedicationIntake({
  apiLabel,
  apiTone,
  initialIntake,
  onSessionStarted,
}: Props) {
  const [intake, setIntake] = useState(initialIntake);
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

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

  const requiredComplete = [
    intake.patientName.trim(),
    intake.state.trim(),
    intake.medicationName.trim(),
    intake.quotedPriceCents > 0,
    intake.insuranceType.trim(),
  ].filter(Boolean).length;

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#1f1e1d] px-4 py-5 text-[#f7f2ec] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-[#ef6844]/10 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-[1180px] flex-col">
        <div className="ui-sans flex items-center justify-end">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${apiTone}`}
          >
            <Activity size={13} />
            {apiLabel}
          </span>
        </div>

        <section className="flex flex-1 flex-col justify-center py-8 lg:py-10">
          <div className="mx-auto w-full max-w-[980px]">
            <div className="text-center">
              <div className="evidence-wordmark evidence-mark inline-flex pr-7 text-[2.85rem] leading-none text-[#f7f2ec] sm:pr-8 sm:text-[4.8rem]">
                AffordEvidence
              </div>
              <p className="ui-sans mx-auto mt-4 max-w-[44rem] text-sm leading-6 text-[#c7c0b8] sm:text-base">
                Enter the client, medication, and coverage details. The affordability review starts from this case file.
              </p>
            </div>

            <div className="ui-sans mt-8 flex flex-wrap items-center justify-center gap-2">
              <button
                className={`button-press inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                  selectedCaseId === null
                    ? "border-[#ef6844] bg-[#ef6844] text-white"
                    : "border-white/14 bg-white/5 text-[#f7f2ec] hover:border-[#ef6844]/70 hover:bg-[#3a302c]"
                }`}
                type="button"
                onClick={() => {
                  setSelectedCaseId(null);
                  setIntake(initialIntake);
                }}
              >
                <FilePlus2 size={16} />
                Blank case
              </button>
              {demoCases.map((demo) => {
                const selected = selectedCaseId === demo.id;
                return (
                  <button
                    className={`button-press inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${
                      selected
                        ? "border-[#ef6844] bg-[#ef6844] text-white"
                        : "border-white/14 bg-white/5 text-[#f7f2ec] hover:border-[#ef6844]/70 hover:bg-[#3a302c]"
                    }`}
                    key={demo.id}
                    type="button"
                    onClick={() => {
                      setSelectedCaseId(demo.id);
                      setIntake(demo.intake);
                    }}
                  >
                    <ClipboardList size={16} />
                    <span className="truncate">{demo.title}</span>
                    {selected ? <CheckCircle2 size={16} /> : null}
                  </button>
                );
              })}
            </div>

            <form
              className="mt-5 rounded-[2rem] border border-white/12 bg-[#2f2d2b]/95 p-3 shadow-[0_30px_90px_rgb(0_0_0/0.34)] sm:p-4 lg:p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void startInvestigation();
        }}
      >
              <div className="grid gap-3 lg:grid-cols-12">
                <Panel className="lg:col-span-4" title="Client">
                  <Field label="Patient name" required>
            <input
              className="evidence-field ui-sans"
              value={intake.patientName}
              onChange={(event) => update("patientName", event.target.value)}
            />
          </Field>
                  <Field label="State" required>
            <input
              className="evidence-field ui-sans"
              value={intake.state}
              onChange={(event) => update("state", event.target.value)}
            />
          </Field>
                  <Field label="Diagnosis">
                    <input
                      className="evidence-field ui-sans"
                      value={intake.diagnosis}
                      onChange={(event) => update("diagnosis", event.target.value)}
                    />
                  </Field>
                </Panel>

                <Panel className="lg:col-span-4" title="Medication">
                  <Field label="Medication" required>
            <input
              className="evidence-field ui-sans"
              value={intake.medicationName}
              onChange={(event) => update("medicationName", event.target.value)}
            />
          </Field>
                  <Field label="Strength">
            <input
              className="evidence-field ui-sans"
              value={intake.strength}
              onChange={(event) => update("strength", event.target.value)}
            />
          </Field>
                  <Field label="Dose">
            <input
              className="evidence-field ui-sans"
              value={intake.dose}
              onChange={(event) => update("dose", event.target.value)}
            />
          </Field>
                </Panel>

                <Panel className="lg:col-span-4" title="Coverage">
                  <Field label="Quoted price" required>
                    <div className="relative">
                      <span className="ui-sans pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#c7c0b8]">
                        $
                      </span>
                      <input
                        className="evidence-field ui-sans pl-8"
                        min={0}
                        step={1}
                        type="number"
                        value={Math.round(intake.quotedPriceCents / 100)}
                        onChange={(event) =>
                          update(
                            "quotedPriceCents",
                            Math.max(Number(event.target.value || 0) * 100, 0),
                          )
                        }
                      />
                    </div>
                  </Field>
                  <Field label="Insurance" required>
            <select
              className="evidence-field ui-sans"
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
              className="evidence-field ui-sans"
              value={intake.paStatus}
              onChange={(event) => update("paStatus", event.target.value as PaStatus)}
            >
              <option value="approved">approved</option>
              <option value="pending">pending</option>
              <option value="denied">denied</option>
              <option value="unknown">unknown</option>
            </select>
          </Field>
                </Panel>

                <Panel className="lg:col-span-5" title="Plan">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Plan name">
                      <input
                        className="evidence-field ui-sans"
                        value={intake.planName}
                        onChange={(event) => update("planName", event.target.value)}
                      />
                    </Field>
                    <Field label="Plan ID">
                      <input
                        className="evidence-field ui-sans"
                        value={intake.planId}
                        onChange={(event) => update("planId", event.target.value)}
                      />
                    </Field>
                  </div>
                </Panel>

                <Panel className="lg:col-span-7" title="Plan or pharmacy text">
                  <textarea
                    className="evidence-field ui-sans min-h-28 resize-y"
                    value={intake.pastedText}
                    onChange={(event) => update("pastedText", event.target.value)}
                  />
                </Panel>
              </div>

              {error ? (
                <p className="ui-sans mt-3 flex items-start gap-2 rounded-2xl border border-[#ff8a7c]/35 bg-[#4a2723] px-4 py-3 text-sm font-semibold text-[#ffd9d3]">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  {error}
                </p>
              ) : null}

              <div className="ui-sans mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                <span className="flex items-center gap-2 text-sm text-[#c7c0b8]">
                  <ShieldCheck size={16} className="text-[#ef6844]" />
                  <span>
                    <span className="font-semibold text-[#f7f2ec]">{requiredComplete}/5</span> required fields ready
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="button-press inline-flex min-h-12 items-center gap-2 rounded-full border border-white/16 bg-transparent px-5 py-2 text-sm font-semibold text-[#f7f2ec] hover:border-white/35 hover:bg-white/6"
                    type="button"
                    onClick={() => {
                      setSelectedCaseId(null);
                      setIntake(initialIntake);
                    }}
                  >
                    <RotateCcw size={16} />
                    Reset
                  </button>
                  <button
                    className="button-press inline-flex min-h-12 items-center gap-2 rounded-full bg-[#ef6844] px-6 py-2 text-sm font-semibold text-white shadow-[0_18px_42px_rgb(239_104_68/0.24)] hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#69534c] disabled:text-[#b9afa7] disabled:shadow-none"
                    disabled={requiredMissing || submitting}
                    type="submit"
                  >
                    {submitting ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
                    Start review
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`evidence-panel rounded-[1.5rem] p-4 ${className}`}>
      <h2 className="mb-3 text-xl font-semibold text-[#f7f2ec]">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="ui-sans flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
        {label}
        {required ? <span className="text-[#ef6844]">Required</span> : null}
      </span>
      {children}
    </label>
  );
}
