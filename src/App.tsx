import { useEffect, useState } from "react";

type HealthState = "checking" | "ok" | "unavailable";

export function App() {
  const [health, setHealth] = useState<HealthState>("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => setHealth(res.ok ? "ok" : "unavailable"))
      .catch(() => setHealth("unavailable"));
  }, []);

  return (
    <main>
      <h1>Updates and Support</h1>
      <p>Server status: {health}</p>
    </main>
  );
}
