import { Route } from "lucide-react";
import type { AffordabilityOption } from "./medicationTypes";

export default function OptionsBoard({ options }: { options: AffordabilityOption[] }) {
  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-[#f7f2ec]">
          <Route size={16} />
          Affordability routes
        </h2>
        <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
          {options.length} found
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {options.length === 0 ? (
          <p className="ui-sans border border-dashed border-white/12 bg-[#2b2928] p-3 text-sm text-[#c7c0b8]">
            Waiting for ranked routes.
          </p>
        ) : null}
        {options.map((option) => (
          <article className="border border-white/12 bg-[#2b2928] p-4" key={option.id}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#f7f2ec]">{option.title}</h3>
              <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
                {option.confidence.replaceAll("_", " ")}
              </span>
            </div>
            <p className="ui-sans mt-2 text-sm leading-6 text-[#c7c0b8]">{option.summary}</p>
            {option.dropType ? (
              <p className="ui-sans mt-3 text-xs font-semibold text-[#ef6844]">{option.dropType.replaceAll("_", " ")}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
