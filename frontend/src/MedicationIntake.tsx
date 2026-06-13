import {
  AlertCircle,
  CheckCircle2,
  FilePlus2,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  createMedicationSession,
  getMedicationDemoCases,
  getMedicationResources,
} from "./api";
import { PRODUCT_LOGO_SRC, PRODUCT_NAME } from "./brand";
import type {
  DemoCase,
  MedicationIntakeData,
  MedicationResourceConnection,
  PaStatus,
} from "./medicationTypes";

type Props = {
  initialIntake: MedicationIntakeData;
  onSessionStarted: (sessionId: string, intake: MedicationIntakeData) => void;
};

type ScenarioId = "before_fill" | "sticker_shock" | "coupon_behavior";

type ScenarioOption = {
  id: ScenarioId;
  title: string;
  shortTitle: string;
  body: string;
  checks: string[];
  submitNote: string;
};

const SCENARIO_OPTIONS: ScenarioOption[] = [
  {
    id: "before_fill",
    title: "Before fill",
    shortTitle: "Pre-fill check",
    body: "I have a prescription and want likely blockers checked before pickup.",
    checks: ["PA and step therapy", "tier and quantity limits", "generic, biosimilar, or cash paths"],
    submitNote:
      "Patient is before the first fill and wants likely access blockers, expected price drivers, alternatives, and cash-vs-insurance tradeoffs checked.",
  },
  {
    id: "sticker_shock",
    title: "At sticker shock",
    shortTitle: "High quote rescue",
    body: "The pharmacy quoted a price that looks wrong or unaffordable.",
    checks: ["why the quote is high", "insurance versus cash", "copay support, PAP, appeal, or exception"],
    submitNote:
      "Patient has a high pharmacy quote and needs an explanation plus ranked routes across insurance, cash, assistance, appeals, and plan exceptions.",
  },
  {
    id: "coupon_behavior",
    title: "Coupon acting weird",
    shortTitle: "Coupon check",
    body: "A copay card was used or expected, but the deductible story does not add up.",
    checks: ["accumulator signals", "maximizer or AFP behavior", "whether assistance counts to OOP"],
    submitNote:
      "Patient used or expected manufacturer assistance. Check whether assistance will not count toward deductible or out-of-pocket maximum, and scan for accumulator, maximizer, variable copay, or alternative funding behavior.",
  },
];

const SCENARIO_NOTE_PREFIX = "CopayGuard use reason:";

const HEALTHCARE_SOURCE_CATEGORIES = new Set([
  "Core public data",
  "Insurance and benefit rails",
  "Cash, coupon, and direct-pay sources",
  "Clinical alternative context",
  "Assistance programs",
  "Accumulator, maximizer, and AFP detection",
  "Appeals and execution sources",
]);

export default function MedicationIntake({
  initialIntake,
  onSessionStarted,
}: Props) {
  const [intake, setIntake] = useState(initialIntake);
  const [demoCases, setDemoCases] = useState<DemoCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [resources, setResources] = useState<MedicationResourceConnection[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<ScenarioId>(() =>
    inferScenarioId(initialIntake),
  );
  const [caseReason, setCaseReason] = useState(() => caseReasonFromIntake(initialIntake));

  useEffect(() => {
    getMedicationDemoCases()
      .then(setDemoCases)
      .catch(() => setDemoCases([]));
    getMedicationResources()
      .then(setResources)
      .catch(() => setResources([]));
  }, []);

  async function startInvestigation(nextIntake = intake) {
    const scenarioForSubmit = scenarioForReason(nextIntake, caseReason, selectedScenario);
    const submittedIntake = withScenarioContext(nextIntake, scenarioForSubmit, caseReason);
    setError(null);
    setSubmitting(true);
    try {
      const { sessionId } = await createMedicationSession(submittedIntake);
      onSessionStarted(sessionId, submittedIntake);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the case.");
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof MedicationIntakeData>(key: K, value: MedicationIntakeData[K]) {
    setIntake((current) => ({ ...current, [key]: value }));
  }

  const selectedScenario =
    SCENARIO_OPTIONS.find((option) => option.id === selectedScenarioId) ?? SCENARIO_OPTIONS[1];
  const quotedPriceRequired = selectedScenarioId !== "before_fill";

  const requiredMissing =
    !intake.state.trim() ||
    !intake.medicationName.trim() ||
    (quotedPriceRequired && intake.quotedPriceCents <= 0) ||
    !intake.insuranceType.trim() ||
    !caseReason.trim();

  const requiredChecks = [
    intake.state.trim(),
    intake.medicationName.trim(),
    intake.insuranceType.trim(),
    caseReason.trim(),
    ...(quotedPriceRequired ? [intake.quotedPriceCents > 0] : []),
  ];
  const requiredComplete = requiredChecks.filter(Boolean).length;
  const requiredTotal = quotedPriceRequired ? 5 : 4;

  return (
    <main className="relative min-h-[100dvh] overflow-x-clip bg-[#1f1e1d] text-[#f7f2ec]">
      <div className="relative mx-auto flex min-h-[100dvh] w-full min-w-0 max-w-[1280px] flex-col px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-10 lg:pt-8">

        <section className="flex min-w-0 flex-1 flex-col justify-start py-0">
          <div className="w-full min-w-0">
            <div className="mx-auto w-full max-w-[880px] text-center">
              <div className="inline-flex w-full max-w-full min-w-0 flex-col items-center gap-4 sm:w-auto sm:flex-row sm:justify-center">
                <img
                  className="h-28 w-28 shrink-0 object-contain drop-shadow-[0_0_1px_rgb(247_242_236/0.65)] sm:h-32 sm:w-32"
                  src={PRODUCT_LOGO_SRC}
                  alt={`${PRODUCT_NAME} logo`}
                />
                <h1 className="max-w-full min-w-0 break-words text-center text-[2.25rem] font-semibold leading-none tracking-[-0.045em] text-[#f7f2ec] min-[430px]:text-[2.7rem] sm:text-6xl lg:text-7xl">
                  {PRODUCT_NAME}
                </h1>
              </div>
              <p className="ui-sans mx-auto mt-6 w-full max-w-[50rem] break-words px-1 text-base leading-7 text-[#c7c0b8] sm:text-lg sm:leading-8">
                Fill the case, explain what happened, and CopayGuard routes the safest next move
                before the price becomes a surprise.
              </p>
            </div>

            <ProductExplainer />

            <HealthcareLogoMarquee resources={resources} />

            <DemoCasePicker
              demoCases={demoCases}
              selectedCaseId={selectedCaseId}
              onBlank={() => {
                setSelectedCaseId(null);
                setSelectedScenarioId(inferScenarioId(initialIntake));
                setCaseReason(caseReasonFromIntake(initialIntake));
                setIntake(initialIntake);
              }}
              onSelect={(demo) => {
                const scenarioId = inferScenarioId(demo.intake);
                setSelectedCaseId(demo.id);
                setSelectedScenarioId(scenarioId);
                setCaseReason(caseReasonFromIntake(demo.intake) || defaultReasonForScenario(scenarioId));
                setIntake(demo.intake);
              }}
            />

            <div className="mt-12 flex items-center gap-5">
              <span className="ui-sans flex h-12 w-12 shrink-0 items-center justify-center bg-[#3a302c] text-2xl text-[#f7f2ec]">
                1
              </span>
              <h2 className="min-w-0 break-words text-3xl font-semibold tracking-[-0.04em] text-[#f7f2ec] sm:text-5xl">
                Complete case information
              </h2>
            </div>

            <form
              className="mt-8 min-w-0 border-0 bg-transparent p-0"
        onSubmit={(event) => {
          event.preventDefault();
          void startInvestigation();
        }}
      >
              <div className="grid gap-4 lg:grid-cols-12">
                <Panel className="lg:col-span-4" title="Client">
                  <Field label="Patient name">
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
                  <Field
                    label={quotedPriceRequired ? "Quoted price" : "Expected or quoted price"}
                    required={quotedPriceRequired}
                  >
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

              <div className="mt-12 flex items-center gap-5">
                <span className="ui-sans flex h-12 w-12 shrink-0 items-center justify-center bg-[#3a302c] text-2xl text-[#f7f2ec]">
                  2
                </span>
                <h2 className="min-w-0 break-words text-3xl font-semibold tracking-[-0.04em] text-[#f7f2ec] sm:text-5xl">
                  Tell us what applies
                </h2>
              </div>

              <ReasonDetails
                value={caseReason}
                selectedScenarioId={selectedScenarioId}
                onChange={(value) => {
                  setCaseReason(value);
                  setSelectedScenarioId(inferScenarioId({ ...intake, pastedText: value }));
                }}
                onUseExample={(option) => {
                  setSelectedScenarioId(option.id);
                  setCaseReason(option.body);
                }}
              />

              {error ? (
                <p className="ui-sans mt-6 flex items-start gap-2 border border-[#ff8a7c]/35 bg-[#190b09] px-4 py-3 text-sm font-semibold text-[#ffd9d3]">
                  <AlertCircle className="mt-0.5 shrink-0" size={16} />
                  {error}
                </p>
              ) : null}

              <div className="mt-12 flex items-center gap-5">
                <span className="ui-sans flex h-12 w-12 shrink-0 items-center justify-center bg-[#3a302c] text-2xl text-[#f7f2ec]">
                  3
                </span>
                <h2 className="min-w-0 break-words text-3xl font-semibold tracking-[-0.04em] text-[#f7f2ec] sm:text-5xl">
                  Start the agent
                </h2>
              </div>

              <div className="ui-sans mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/12 pt-6">
                <span className="flex items-center gap-2 text-sm text-[#c7c0b8]">
                  <ShieldCheck size={16} className="text-[#ef6844]" />
                  <span>
                    <span className="font-semibold text-[#f7f2ec]">
                      {requiredComplete}/{requiredTotal}
                    </span>{" "}
                    required fields ready
                  </span>
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="button-press inline-flex min-h-12 items-center gap-2 border border-white/12 bg-[#1f1e1d] px-5 py-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#f7f2ec] hover:border-[#ef6844]/70"
                    type="button"
                    onClick={() => {
                      setSelectedCaseId(null);
                      setSelectedScenarioId(inferScenarioId(initialIntake));
                      setCaseReason(caseReasonFromIntake(initialIntake));
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

function HealthcareLogoMarquee({ resources }: { resources: MedicationResourceConnection[] }) {
  const healthcareResources = resources.filter((resource) =>
    HEALTHCARE_SOURCE_CATEGORIES.has(resource.category),
  );
  if (healthcareResources.length === 0) return null;

  const marqueeResources = [...healthcareResources, ...healthcareResources];

  return (
    <section className="connection-marquee-section mt-10" aria-label="Connected healthcare sources">
      <div className="connection-marquee">
        <div className="connection-marquee-track">
          {marqueeResources.map((resource, index) => {
            const duplicate = index >= healthcareResources.length;
            return (
              <a
                aria-hidden={duplicate ? "true" : undefined}
                aria-label={duplicate ? undefined : resource.name}
                className="connection-logo-tile button-press"
                href={resource.url}
                key={`${resource.id}-${index}`}
                rel="noreferrer"
                tabIndex={duplicate ? -1 : undefined}
                target="_blank"
                title={resource.name}
              >
                <ResourceLogo resource={resource} />
                <span className="connection-logo-name">{resource.name}</span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ResourceLogo({ resource }: { resource: MedicationResourceConnection }) {
  const [failed, setFailed] = useState(false);
  const logoUrl = resource.logoUrl ?? logoUrlFromDomains(resource.domains);
  return (
    <span className="connection-logo" aria-hidden="true">
      {logoUrl && !failed ? (
        <img
          alt=""
          src={logoUrl}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initials(resource.name)}</span>
      )}
    </span>
  );
}

function logoUrlFromDomains(domains: string[]): string | null {
  const domain = domains.find(Boolean);
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?sz=64&domain_url=https://${domain}`;
}

function initials(name: string): string {
  return name
    .replace(/\([^)]*\)/g, "")
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function ReasonDetails({
  value,
  selectedScenarioId,
  onChange,
  onUseExample,
}: {
  value: string;
  selectedScenarioId: ScenarioId;
  onChange: (value: string) => void;
  onUseExample: (option: ScenarioOption) => void;
}) {
  return (
    <section className="reason-step mt-8 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <div className="evidence-panel p-4 sm:p-5">
        <Field label="Reason for using CopayGuard" required>
          <textarea
            className="evidence-field ui-sans min-h-40 resize-y"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Example: The pharmacy quoted $550 and I want to know if insurance, cash pricing, copay support, or an appeal is the safest route."
          />
        </Field>
        <p className="ui-sans mt-3 text-sm leading-6 text-[#c7c0b8]">
          Include what felt wrong, what you already tried, and whether you care more about
          today&apos;s price or deductible and out-of-pocket progress.
        </p>
      </div>

      <div className="evidence-panel p-4 sm:p-5">
        <h3 className="ui-sans text-sm font-semibold uppercase tracking-[0.12em] text-[#c7c0b8]">
          Examples
        </h3>
        <div className="mt-4 grid gap-3">
        {SCENARIO_OPTIONS.map((option) => {
          const selected = selectedScenarioId === option.id;
          return (
            <button
              className={`reason-example button-press text-left ${
                selected ? "reason-example-selected" : ""
              }`}
              key={option.id}
              type="button"
              onClick={() => onUseExample(option)}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="ui-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#ffd0be]">
                  {option.shortTitle}
                </span>
                {selected ? <CheckCircle2 className="text-[#76d7a6]" size={20} /> : null}
              </div>
              <p className="ui-sans mt-2 text-sm leading-6 text-[#c7c0b8]">{option.body}</p>
            </button>
          );
        })}
        </div>
      </div>
    </section>
  );
}

function DemoCasePicker({
  demoCases,
  selectedCaseId,
  onBlank,
  onSelect,
}: {
  demoCases: DemoCase[];
  selectedCaseId: string | null;
  onBlank: () => void;
  onSelect: (demo: DemoCase) => void;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-[-0.045em] text-[#f7f2ec] sm:text-4xl">
            Try a demo case
          </h2>
          <p className="ui-sans mt-3 max-w-[42rem] text-sm leading-6 text-[#c7c0b8]">
            Load a realistic case file, then edit any field before starting the review.
          </p>
        </div>
        <button
          className={`button-press ui-sans inline-flex min-h-12 items-center gap-2 border px-4 py-2 text-sm font-semibold uppercase tracking-[0.08em] ${
            selectedCaseId === null
              ? "border-[#ef6844] bg-[#ef6844] text-white"
              : "border-white/12 bg-[#1f1e1d] text-[#c7c0b8] hover:border-[#ef6844]/70 hover:text-[#f7f2ec]"
          }`}
          type="button"
          onClick={onBlank}
        >
          <FilePlus2 size={16} />
          Blank case
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {demoCases.map((demo) => {
          const selected = selectedCaseId === demo.id;
          const scenario = SCENARIO_OPTIONS.find(
            (option) => option.id === inferScenarioId(demo.intake),
          );
          return (
            <button
              className={`demo-case-card button-press text-left ${
                selected ? "demo-case-card-selected" : ""
              }`}
              key={demo.id}
              type="button"
              onClick={() => onSelect(demo)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="ui-sans border border-[#ef6844]/35 bg-[#2b1b15] px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#ffd0be]">
                  {scenario?.shortTitle ?? "Case file"}
                </span>
                {selected ? <CheckCircle2 className="text-[#76d7a6]" size={18} /> : null}
              </div>
              <h3 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.035em] text-[#f7f2ec]">
                {demo.title}
              </h3>
              <p className="ui-sans mt-3 text-sm leading-6 text-[#c7c0b8]">{demo.summary}</p>
              <div className="ui-sans mt-5 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#8f8780]">
                <span>{demo.intake.insuranceType}</span>
                <span>
                  {demo.intake.quotedPriceCents > 0
                    ? `$${Math.round(demo.intake.quotedPriceCents / 100).toLocaleString()}`
                    : "No quote yet"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProductExplainer() {
  return (
    <section className="mt-12 grid min-w-0 gap-8 lg:grid-cols-3">
      <ExplainerStep
        number="1"
        title="Fill in your information"
        body="Add the patient, medication, coverage, quote if available, and any plan or pharmacy text."
        visual={<CaseFileVisual />}
      />
      <ExplainerStep
        number="2"
        title="Explain what applies"
        body="Describe whether this is pre-fill planning, sticker shock, or strange coupon behavior."
        visual={<ReasonVisual />}
      />
      <ExplainerStep
        number="3"
        title="Start the agent"
        body="CopayGuard searches routes, ranks the safest next step, and shows the price or coverage impact."
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
      <div className="infographic-visual mt-6 min-w-0">{visual}</div>
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

function ReasonVisual() {
  return (
    <div className="grid h-full content-center gap-4 p-5 sm:p-7">
      <div className="infographic-mini-card grid gap-3">
        <p className="text-lg font-semibold text-[#f7f2ec]">What happened?</p>
        <div className="grid gap-2">
          <div className="h-3 w-4/5 bg-[#5f5a56]" />
          <div className="h-3 w-3/5 bg-[#3a3835]" />
          <div className="h-3 w-5/6 bg-[#3a3835]" />
        </div>
      </div>
      <div className="grid gap-3">
        {["Before fill", "Sticker shock", "Coupon behavior"].map((item, index) => (
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

function inferScenarioId(intake: MedicationIntakeData): ScenarioId {
  const text = intake.pastedText.toLowerCase();
  if (
    text.includes("will not count") ||
    text.includes("out-of-pocket maximum") ||
    text.includes("variable copay") ||
    text.includes("prudentrx") ||
    text.includes("saveonsp") ||
    text.includes("accumulator") ||
    text.includes("maximizer") ||
    text.includes("alternative funding")
  ) {
    return "coupon_behavior";
  }

  if (intake.quotedPriceCents >= 10000) return "sticker_shock";
  if (intake.quotedPriceCents <= 0) return "before_fill";
  return "sticker_shock";
}

function caseReasonFromIntake(intake: MedicationIntakeData): string {
  const existingReason = intake.pastedText
    .split("\n")
    .find((line) => line.trim().startsWith(SCENARIO_NOTE_PREFIX));
  return existingReason?.replace(SCENARIO_NOTE_PREFIX, "").trim() ?? "";
}

function defaultReasonForScenario(scenarioId: ScenarioId): string {
  return (
    SCENARIO_OPTIONS.find((option) => option.id === scenarioId) ?? SCENARIO_OPTIONS[1]
  ).body;
}

function scenarioForReason(
  intake: MedicationIntakeData,
  caseReason: string,
  fallback: ScenarioOption,
): ScenarioOption {
  const inferred = inferScenarioId({
    ...intake,
    pastedText: [caseReason, intake.pastedText].filter(Boolean).join("\n"),
  });
  return SCENARIO_OPTIONS.find((option) => option.id === inferred) ?? fallback;
}

function withScenarioContext(
  intake: MedicationIntakeData,
  scenario: ScenarioOption,
  caseReason = "",
): MedicationIntakeData {
  const existingLines = intake.pastedText
    .split("\n")
    .filter((line) => !line.startsWith(SCENARIO_NOTE_PREFIX));
  const existingText = existingLines.join("\n").trim();
  const reasonText = caseReason.trim() || scenario.body;
  const scenarioLine = `${SCENARIO_NOTE_PREFIX} ${scenario.title}. ${reasonText} ${scenario.submitNote}`;
  return {
    ...intake,
    pastedText: [scenarioLine, existingText].filter(Boolean).join("\n\n"),
  };
}
