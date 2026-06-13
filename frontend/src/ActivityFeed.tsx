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
        <span className="ui-sans rounded-full border border-white/12 bg-white/5 px-2.5 py-1 text-xs font-semibold text-[#c7c0b8]">
          {running ? "Running" : "Idle"}
        </span>
      </div>
      <div className="mt-3 space-y-3">
        {activities.length === 0 ? (
          <p className="ui-sans rounded-2xl border border-dashed border-white/18 bg-white/5 p-3 text-sm text-[#c7c0b8]">
            {running ? "Starting the case review." : "No activity yet."}
          </p>
        ) : null}
        {activities.map((activity) => (
          <div className="flex gap-3 rounded-2xl border border-white/12 bg-white/5 p-4" key={activity.id}>
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
