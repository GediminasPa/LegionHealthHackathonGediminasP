import { ShieldCheck } from "lucide-react";
import type { MedicationIntakeData, MedicationSnapshot } from "./medicationTypes";
import { formatCents } from "./CostTracker";

export default function CaseDashboard({
  intake,
  flags,
  status,
}: {
  intake: MedicationIntakeData;
  flags: string[];
  status: MedicationSnapshot["status"];
}) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-950">Case</h2>
          <p className="mt-1 text-sm text-stone-600">
            {intake.patientName} · {intake.medicationName}
          </p>
        </div>
        <span className="rounded-md bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700">
          {status}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact label="plan" value={intake.planName || intake.insuranceType} />
        <Fact label="PA" value={intake.paStatus} />
        <Fact label="diagnosis" value={intake.diagnosis || "unknown"} />
        <Fact label="quote" value={formatCents(intake.quotedPriceCents)} />
      </dl>
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <ShieldCheck size={16} />
          Guardrails
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(flags.length ? flags : ["confirm eligibility", "no guaranteed savings"]).map((flag) => (
            <span
              className="rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-900"
              key={flag}
            >
              {flag.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-stone-50 px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-stone-950">{value}</dd>
    </div>
  );
}
