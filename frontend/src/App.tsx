import { useEffect, useState } from "react";
import { getHealth, type Health } from "./api";
import Chat from "./Chat";

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);

  useEffect(() => {
    getHealth()
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  const dbOk = health?.db === "ok";

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">
          {health?.app ?? "LegionHealthHackathonGediminasP"}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            healthError
              ? "bg-red-100 text-red-700"
              : dbOk
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {healthError ? "API down" : dbOk ? "API + DB ok" : health ? "DB unavailable" : "…"}
        </span>
      </header>
      <Chat />
    </div>
  );
}
