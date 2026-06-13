import { CheckCircle2, CircleDot } from "lucide-react";
import type { ActivityEvent } from "./medicationTypes";

export default function ActivityFeed({
  activities,
  running,
}: {
  activities: ActivityEvent[];
  running: boolean;
}) {
  return (
    <section className="medical-surface rounded-lg p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-[#f7f2ec]">Activity</h2>
        <span className="ui-sans border border-white/12 bg-[#1f1e1d] px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#c7c0b8]">
          {running ? "Running" : "Idle"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {activities.length === 0 ? (
          <p className="ui-sans border border-dashed border-white/12 bg-[#2b2928] p-3 text-sm text-[#c7c0b8]">
            {running ? "Starting the case review." : "No activity yet."}
          </p>
        ) : null}
        {activities.map((activity) => (
          <div className="flex gap-3 border border-white/12 bg-[#2b2928] p-4" key={activity.id}>
            <span className="mt-0.5 text-[#ef6844]">
              {activity.status === "completed" ? <CheckCircle2 size={17} /> : <CircleDot size={17} />}
            </span>
            <div>
              <p className="text-sm font-semibold text-[#f7f2ec]">{activity.title}</p>
              <p className="ui-sans text-sm leading-6 text-[#c7c0b8]">{activity.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
