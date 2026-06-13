import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { createMedicationSession, getMedicationDemoCases } from "./api";
import { PRODUCT_LOGO_SRC, PRODUCT_NAME } from "./brand";
import type { DemoCase, MedicationIntakeData, PaStatus } from "./medicationTypes";

type Props = {
  initialIntake: MedicationIntakeData;
  onSessionStarted: (sessionId: string, intake: MedicationIntakeData) => void;
};

export default function MedicationIntake({
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#1f1e1d] text-[#f7f2ec]">
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[1280px] flex-col px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8">

        <section className="flex flex-1 flex-col justify-start py-0">
          <div className="w-full">
            <div className="mx-auto max-w-[880px] text-center">
              <div className="inline-flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
                <img
                  className="h-28 w-28 shrink-0 object-contain drop-shadow-[0_0_1px_rgb(247_242_236/0.65)] sm:h-32 sm:w-32"
                  src={PRODUCT_LOGO_SRC}
                  alt={`${PRODUCT_NAME} logo`}
                />
                <h1 className="text-4xl font-semibold leading-[0.98] tracking-[-0.055em] text-[#f7f2ec] min-[430px]:text-5xl sm:text-6xl lg:text-7xl">
                  {PRODUCT_NAME}
                </h1>
              </div>
              <p className="ui-sans mx-auto mt-6 max-w-[50rem] break-words px-1 text-base leading-7 text-[#c7c0b8] sm:text-lg sm:leading-8">
                Enter the client, medication, and coverage details. The affordability review starts from this case file.
              </p>
            </div>

            <ProductExplainer />

            <div className="ui-sans mt-10 flex flex-wrap items-center gap-2">
              <button
                className={`button-press inline-flex items-center gap-2 border px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] ${
                  selectedCaseId === null
                    ? "border-[#ef6844] bg-[#ef6844] text-white"
                    : "border-white/12 bg-[#1f1e1d] text-[#c7c0b8] hover:border-[#ef6844]/70 hover:text-[#f7f2ec]"
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
                    className={`button-press inline-flex max-w-full items-center gap-2 border px-4 py-3 text-sm font-semibold uppercase tracking-[0.08em] ${
                      selected
                        ? "border-[#ef6844] bg-[#ef6844] text-white"
                        : "border-white/12 bg-[#1f1e1d] text-[#c7c0b8] hover:border-[#ef6844]/70 hover:text-[#f7f2ec]"
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

            <div className="mt-12 flex items-center gap-5">
              <span className="ui-sans flex h-12 w-12 shrink-0 items-center justify-center bg-[#3a302c] text-2xl text-[#f7f2ec]">
                1
              </span>
              <h2 className="text-4xl font-semibold tracking-[-0.05em] text-[#f7f2ec] sm:text-5xl">
                Complete case information
              </h2>
            </div>

            <form
              className="mt-8 border-0 bg-transparent p-0"
        onSubmit={(event) => {
          event.preventDefault();
          void startInvestigation();
        }}
      >
              <div className="grid gap-4 lg:grid-cols-12">
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
                <p className="ui-sans mt-6 flex items-start gap-2 border border-[#ff8a7c]/35 bg-[#190b09] px-4 py-3 text-sm font-semibold text-[#ffd9d3]">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  {error}
                </p>
              ) : null}

              <div className="ui-sans mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-6">
                <span className="flex items-center gap-2 text-sm text-[#c7c0b8]">
                  <ShieldCheck size={16} className="text-[#ef6844]" />
                  <span>
                    <span className="font-semibold text-[#f7f2ec]">{requiredComplete}/5</span> required fields ready
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="button-press inline-flex min-h-12 items-center gap-2 border border-white/12 bg-[#1f1e1d] px-5 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#f7f2ec] hover:border-[#ef6844]/70"
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
                    className="button-press inline-flex min-h-12 items-center gap-2 bg-[#ef6844] px-6 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-white hover:bg-[#ff7a52] disabled:cursor-not-allowed disabled:bg-[#3a302c] disabled:text-[#777777]"
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

function ProductExplainer() {
  return (
    <section className="mt-12 grid gap-8 lg:grid-cols-3">
      <ExplainerStep
        number="1"
        title="Fill in the information"
        body="Add the medication, quoted price, coverage, and any pharmacy or plan notes."
        visual={<CaseFileVisual />}
      />
      <ExplainerStep
        number="2"
        title="Agent searches routes"
        body="CopayGuard checks plan rules, assistance programs, coupons, and pharmacy options."
        visual={<AgentSearchVisual />}
      />
      <ExplainerStep
        number="3"
        title="See the price drop"
        body="The best route is ranked with evidence, next steps, and a clearer expected cost."
        visual={<PriceDropVisual />}
      />
    </section>
  );
}

function ExplainerStep({
  number,
  title,
  body,
  visual,
}: {
  number: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}) {
  return (
    <article className="infographic-step min-w-0">
      <p className="infographic-step-number">{number}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#f7f2ec] sm:text-3xl lg:text-[2rem]">
        {title}
      </h2>
      <p className="ui-sans mt-3 max-w-[29rem] break-words text-[0.95rem] leading-6 text-[#c7c0b8]">
        {body}
      </p>
      <div className="infographic-visual mt-6">{visual}</div>
    </article>
  );
}

function CaseFileVisual() {
  return (
    <div className="grid h-full content-center gap-4 p-5 sm:p-7">
      <div className="infographic-mini-card flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#ef6844] text-white">
            <FilePlus2 size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-[#f7f2ec]">Case details</p>
            <p className="ui-sans mt-1 truncate text-xs text-[#c7c0b8]">Quote and plan</p>
          </div>
        </div>
        <span className="ui-sans shrink-0 border border-[#ef6844]/50 bg-[#2b1b15] px-2 py-1 text-xs font-semibold text-[#ffd0be]">
          Ready
        </span>
      </div>

      <div className="infographic-mini-card grid gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-lg font-semibold text-[#f7f2ec]">Prescription</p>
          <CheckCircle2 className="text-[#ffc36a]" size={20} />
        </div>
        <div className="grid gap-3">
          <div className="h-3 w-3/5 bg-[#5f5a56]" />
          <div className="h-3 w-4/5 bg-[#3a3835]" />
          <div className="h-3 w-2/5 bg-[#3a3835]" />
        </div>
      </div>
    </div>
  );
}

function AgentSearchVisual() {
  return (
    <div className="grid h-full content-center gap-4 p-5 sm:p-7">
      <div className="infographic-mini-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-[#f7f2ec]">Search plan</p>
            <p className="ui-sans mt-1 text-xs text-[#c7c0b8]">Multiple routes checked</p>
          </div>
          <span className="infographic-spark flex h-10 w-10 shrink-0 items-center justify-center border border-[#ef6844]/55 bg-[#2b1b15] text-[#ffc36a]">
            <Sparkles size={18} />
          </span>
        </div>
      </div>
      <div className="grid gap-3">
        {["Plan rules", "Assistance", "Coupons", "Pharmacies"].map((item, index) => (
          <div
            className="infographic-database-row ui-sans"
            key={item}
            style={{ "--row-index": index } as CSSProperties}
          >
            <span className="text-[#c7c0b8]">{item}</span>
            <span className="h-1.5 w-1.5 bg-[#ef6844]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PriceDropVisual() {
  return (
    <div className="infographic-price-visual grid gap-4 p-5 sm:p-7">
      <div className="infographic-mini-card infographic-price-comparison relative overflow-hidden">
        <div className="infographic-scan-line" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="ui-sans text-xs font-semibold uppercase tracking-[0.1em] text-[#c7c0b8]">
              Initial quote
            </p>
            <p className="infographic-old-price mt-2 text-4xl font-semibold tracking-[-0.05em]">
              $2,000
            </p>
          </div>
          <div className="text-right">
            <p className="ui-sans text-xs font-semibold uppercase tracking-[0.1em] text-[#c7c0b8]">
              Best option
            </p>
            <p className="infographic-new-price mt-2 text-5xl font-semibold tracking-[-0.06em]">
              $500
            </p>
          </div>
        </div>
      </div>
      <div className="infographic-mini-card infographic-savings-card flex items-center justify-between gap-4">
        <p className="font-semibold text-[#f7f2ec]">$1,500 potential savings</p>
        <ShieldCheck className="shrink-0 text-[#61d394]" size={22} />
      </div>
    </div>
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
    <section className={`evidence-panel p-4 sm:p-5 ${className}`}>
      <h2 className="ui-sans mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#c7c0b8]">
        {title}
      </h2>
      <div className="grid gap-5">{children}</div>
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
      <span className="ui-sans flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
        {label}
        {required ? <span className="text-[#f7f2ec]">Required</span> : null}
      </span>
      {children}
    </label>
  );
}
