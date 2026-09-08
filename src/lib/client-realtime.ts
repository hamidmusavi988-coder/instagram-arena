"use client";
import type PusherClient from "pusher-js";

type Payload = Record<string, unknown>;
type Config = { provider: "sse" } | { provider: "pusher"; key: string; cluster: string; channel: string };
export function connectRealtime(onEvent: (payload: Payload) => void, onState: (connected: boolean) => void) {
  let stopped = false;
  let source: EventSource | null = null;
  let pusher: PusherClient | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  const abort = new AbortController();
  const emit = (payload: Payload) => { if (!stopped) onEvent(payload); };
  const state = (connected: boolean) => { if (!stopped) onState(connected); };
  const resync = () => { if (!stopped && document.visibilityState !== "hidden") emit({ type: "resync" }); };
  const startSse = () => {
    if (stopped || source) return;
    source = new EventSource("/api/live");
    source.onopen = () => { state(true); resync(); };
    source.onerror = () => state(false);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as Payload;
        if (payload.type === "connected" || payload.type === "heartbeat") state(true);
        else if (payload.type !== "reconnect") emit(payload);
      } catch {}
    };
  };
  const stopSse = () => { if (source) { source.onopen = null; source.onerror = null; source.onmessage = null; source.close(); source = null; } };
  async function connect() {
    try {
      const response = await fetch("/api/realtime", { signal: abort.signal });
      if (!response.ok) throw new Error("Realtime configuration unavailable");
      const config = await response.json() as Config;
      if (stopped) return;
      if (config.provider === "sse") { startSse(); return; }
      const { default: Pusher } = await import("pusher-js");
      if (stopped) return;
      pusher = new Pusher(config.key, { cluster: config.cluster, forceTLS: true, channelAuthorization: { endpoint: "/api/realtime", transport: "ajax" } });
      const channel = pusher.subscribe(config.channel);
      channel.bind("loop-update", (payload: Payload) => emit(payload));
      channel.bind("pusher:subscription_succeeded", () => {
        if (fallbackTimer) clearTimeout(fallbackTimer);
        stopSse(); state(true); resync();
      });
      channel.bind("pusher:subscription_error", () => { state(false); startSse(); });
      pusher.connection.bind("state_change", ({ current }: { current: string }) => {
        if (current !== "connected") state(false);
        if (current === "failed" || current === "unavailable") startSse();
      });
      fallbackTimer = setTimeout(startSse, 10000);
    } catch { if (!stopped) startSse(); }
  }
  void connect();
  // Reconciliation catches network gaps and provider failures without claiming
  // that a notification transport is the source of truth for message history.
  const reconcileTimer = setInterval(resync, 30000);
  window.addEventListener("focus", resync);
  document.addEventListener("visibilitychange", resync);
  return () => {
    stopped = true; abort.abort(); stopSse();
    if (fallbackTimer) clearTimeout(fallbackTimer);
    clearInterval(reconcileTimer);
    pusher?.disconnect();
    window.removeEventListener("focus", resync);
    document.removeEventListener("visibilitychange", resync);
  };
}
