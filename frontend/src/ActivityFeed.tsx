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
    <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-stone-950">Activity</h2>
      <div className="mt-3 space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-stone-600">{running ? "Starting" : "No activity yet"}</p>
        ) : null}
        {activities.map((activity) => (
          <div className="flex gap-3" key={activity.id}>
            <span className="mt-0.5 text-teal-700">
              {activity.status === "completed" ? <CheckCircle2 size={17} /> : <CircleDot size={17} />}
            </span>
            <div>
              <p className="text-sm font-medium text-stone-950">{activity.title}</p>
              <p className="text-sm leading-6 text-stone-600">{activity.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
