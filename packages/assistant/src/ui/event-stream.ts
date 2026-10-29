import type { AssistantHost } from "./host";

export function subscribeCoachEvents(
  request: AssistantHost["request"],
  handlers: Parameters<AssistantHost["subscribe"]>[0],
  reset: () => void,
  lifetime?: AbortSignal,
) {
  const subscription = new AbortController();
  const signal = lifetime
    ? AbortSignal.any([subscription.signal, lifetime])
    : subscription.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    try {
      reset();
      const response = await request("/events", { signal });
      if (!response.ok || !response.body)
        throw new Error("Coach stream unavailable");
      if (signal.aborted) {
        await response.body.cancel();
        return;
      }
      handlers.open();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      try {
        while (!signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          let end: number;
          while ((end = pending.indexOf("\n\n")) >= 0) {
            const frame = pending.slice(0, end);
            pending = pending.slice(end + 2);
            const data = frame
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (data && !signal.aborted) handlers.message(data);
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    } catch {
      // A restarted sidecar gets a new endpoint on the next attempt.
    }
    if (!signal.aborted) {
      handlers.error();
      timer = setTimeout(() => void run(), 1500);
    }
  };
  void run();
  return () => {
    subscription.abort();
    clearTimeout(timer);
  };
}
