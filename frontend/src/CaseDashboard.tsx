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
  const statusClass = statusTone(status);

  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#f7f2ec]">Case overview</h2>
          <p className="ui-sans mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-[#c7c0b8]">
            <span>{intake.patientName || "Patient"}</span>
            <span className="text-[#817a74]">/</span>
            <span>{intake.medicationName || "Medication"}</span>
          </p>
        </div>
        <span className={`ui-sans border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${statusClass}`}>
          {status}
        </span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact label="Plan" value={intake.planName || intake.insuranceType} />
        <Fact label="PA" value={intake.paStatus} />
        <Fact label="Diagnosis" value={intake.diagnosis || "Unknown"} />
        <Fact label="Quote" value={formatCents(intake.quotedPriceCents)} />
      </dl>
      <div className="mt-4 border border-white/12 bg-[#2b2928] p-3">
        <p className="ui-sans flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#f7f2ec]">
          <ShieldCheck size={16} />
          Guardrails
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(flags.length ? flags : ["confirm eligibility", "no guaranteed savings"]).map((flag) => (
            <span
              className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]"
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
    <div className="border border-white/12 bg-[#2b2928] px-4 py-3">
      <dt className="ui-sans text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-[#f7f2ec]">{value}</dd>
    </div>
  );
}

function statusTone(status: MedicationSnapshot["status"]): string {
  if (status === "ready") return "border-[#5a5a5a] bg-[#1f1e1d] text-[#f7f2ec]";
  if (status === "error") return "border-[#ff8a7c]/45 bg-[#1f1e1d] text-[#ffd9d3]";
  if (status === "waiting") return "border-[#ffc36a]/55 bg-[#1f1e1d] text-[#ffc36a]";
  if (status === "investigating") return "border-[#ef6844]/60 bg-[#1f1e1d] text-[#ef6844]";
  return "border-white/12 bg-[#1f1e1d] text-[#c7c0b8]";
}
