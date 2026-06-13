import { ExternalLink } from "lucide-react";
import type { SourceRecord } from "./medicationTypes";

export default function SourcesPanel({ sources }: { sources: SourceRecord[] }) {
  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#f7f2ec]">Sources</h2>
        <span className="ui-sans rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#c7c0b8]">
          {sources.length} checked
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {sources.length === 0 ? (
          <p className="ui-sans rounded-2xl border border-dashed border-white/18 bg-white/5 p-3 text-sm text-[#c7c0b8]">
            No sources yet.
          </p>
        ) : null}
        {sources.map((source) => (
          <a
            className="button-press block rounded-2xl border border-white/12 bg-white/5 p-4 hover:border-[#ef6844]/45 hover:bg-[#342d2a]"
            href={source.url}
            key={source.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className="flex items-start justify-between gap-2 text-sm font-semibold text-[#f7f2ec]">
              {source.title}
              <ExternalLink className="shrink-0 text-[#c7c0b8]" size={15} />
            </span>
            {source.publisher ? (
              <span className="ui-sans mt-1 block text-xs font-semibold text-[#ef6844]">{source.publisher}</span>
            ) : null}
            {source.summary ? (
              <span className="ui-sans mt-1 block text-sm leading-6 text-[#c7c0b8]">{source.summary}</span>
            ) : null}
            <span className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-stone-500">
              {source.checkedAt ? <span>Checked {formatDate(source.checkedAt)}</span> : null}
              {source.confidence == null ? null : (
                <span>Confidence {Math.round(source.confidence * 100)}%</span>
              )}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
