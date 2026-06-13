import { ClipboardCopy } from "lucide-react";
import type { ArtifactRecord } from "./medicationTypes";

export default function ArtifactPanel({ artifacts }: { artifacts: ArtifactRecord[] }) {
  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#f7f2ec]">Draft artifacts</h2>
        <span className="ui-sans rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#c7c0b8]">
          {artifacts.length} ready
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {artifacts.length === 0 ? (
          <p className="ui-sans rounded-2xl border border-dashed border-white/18 bg-white/5 p-3 text-sm text-[#c7c0b8]">
            No artifacts yet.
          </p>
        ) : null}
        {artifacts.map((artifact) => (
          <article className="rounded-2xl border border-white/12 bg-white/5 p-4" key={artifact.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[#f7f2ec]">{artifact.title}</h3>
                <p className="ui-sans mt-1 text-xs font-semibold text-[#c7c0b8]">
                  {artifact.artifactType.replaceAll("_", " ")} / {artifact.status}
                </p>
              </div>
              <button
                aria-label="Copy artifact"
                className="button-press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/14 bg-[#2f2d2b] text-[#c7c0b8] hover:border-[#ef6844]/60 hover:text-[#ef6844]"
                type="button"
                onClick={() => void navigator.clipboard.writeText(artifact.content)}
              >
                <ClipboardCopy size={16} />
              </button>
            </div>
            <pre className="scrollbar-soft ui-sans mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/12 bg-[#211f1e] p-3 text-sm leading-6 text-[#d9d2ca]">
              {artifact.content}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
