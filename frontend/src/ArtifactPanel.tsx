import { ClipboardCopy } from "lucide-react";
import type { ArtifactRecord } from "./medicationTypes";

export default function ArtifactPanel({ artifacts }: { artifacts: ArtifactRecord[] }) {
  return (
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-stone-950">Artifacts</h2>
      <div className="mt-3 space-y-3">
        {artifacts.length === 0 ? <p className="text-sm text-stone-600">No artifacts yet.</p> : null}
        {artifacts.map((artifact) => (
          <article className="rounded-md border border-stone-200 bg-stone-50 p-3" key={artifact.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-950">{artifact.title}</h3>
                <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
                  {artifact.artifactType.replaceAll("_", " ")} · {artifact.status}
                </p>
              </div>
              <button
                aria-label="Copy artifact"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 hover:border-teal-600 hover:text-teal-800"
                type="button"
                onClick={() => void navigator.clipboard.writeText(artifact.content)}
              >
                <ClipboardCopy size={16} />
              </button>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-white p-3 text-sm leading-6 text-stone-800">
              {artifact.content}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
