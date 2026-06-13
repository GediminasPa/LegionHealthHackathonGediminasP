import { Route } from "lucide-react";
import type { AffordabilityOption } from "./medicationTypes";

export default function OptionsBoard({ options }: { options: AffordabilityOption[] }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
        <Route size={16} />
        Options
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {options.length === 0 ? (
          <p className="text-sm text-stone-600">Waiting for ranked routes.</p>
        ) : null}
        {options.map((option) => (
          <article className="rounded-md border border-stone-200 bg-stone-50 p-3" key={option.id}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-stone-950">{option.title}</h3>
              <span className="rounded bg-white px-2 py-1 text-xs font-medium text-stone-600">
                {option.confidence.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-600">{option.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
