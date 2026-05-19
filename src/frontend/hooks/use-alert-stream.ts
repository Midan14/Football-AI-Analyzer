import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export function useAlertStream() {
  const { data: session } = useSession();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    const eventSource = new EventSource("/api/alerts/stream");

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "connected") return;

      setAlerts((prev) => {
        const next = [data, ...prev];
        return next.slice(0, 50); // Keep last 50
      });
    };

    return () => eventSource.close();
  }, [session?.user?.id]);

  return { alerts, connected };
}
