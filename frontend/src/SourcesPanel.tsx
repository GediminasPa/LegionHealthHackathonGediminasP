import { ExternalLink } from "lucide-react";
import type { SourceRecord } from "./medicationTypes";

export default function SourcesPanel({ sources }: { sources: SourceRecord[] }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-stone-950">Sources</h2>
      <div className="mt-3 space-y-3">
        {sources.length === 0 ? <p className="text-sm text-stone-600">No sources yet.</p> : null}
        {sources.map((source) => (
          <a
            className="block rounded-md border border-stone-200 bg-stone-50 p-3 hover:border-teal-600"
            href={source.url}
            key={source.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="flex items-start justify-between gap-2 text-sm font-semibold text-stone-950">
              {source.title}
              <ExternalLink className="shrink-0 text-stone-500" size={15} />
            </span>
            {source.summary ? (
              <span className="mt-1 block text-sm leading-6 text-stone-600">{source.summary}</span>
            ) : null}
          </a>
        ))}
      </div>
    </section>
  );
}
