import { fetch as nativeFetch } from "@tauri-apps/plugin-http";

import { AssistantScope } from "@anlg/assistant/scope";
import { AssistantSurface, type AssistantHost } from "@anlg/assistant/ui/host";
import { commands, type Endpoint } from "@anlg/plugin-coach";

import { useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function createAssistantHost(): AssistantHost {
  let endpoint: Promise<Endpoint> | undefined;
  const connect = () =>
    (endpoint ??= commands
      .assistantEndpoint()
      .then((result) => {
        if (result.status === "error") throw new Error(result.error);
        return result.data;
      })
      .catch((error: unknown) => {
        endpoint = undefined;
        throw error;
      }));
  const request: AssistantHost["request"] = async (path, init) => {
    const tab = useTabs.getState().currentTab;
    if (path === "/ask" && typeof init?.body === "string") {
      const body: unknown = JSON.parse(init.body);
      if (body && typeof body === "object")
        init = {
          ...init,
          body: JSON.stringify({
            ...body,
            contextSessionId: tab?.type === TabType.Sessions ? tab.id : null,
          }),
        };
    }
    const current = await connect();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${current.token}`);
    return nativeFetch(new URL(path, current.url), { ...init, headers });
  };
  return {
    scope: AssistantScope.Library,
    surface: AssistantSurface.Embedded,
    request,
    subscribe(handlers) {
      const abort = new AbortController();
      let retry: ReturnType<typeof setTimeout> | undefined;
      const run = async () => {
        try {
          endpoint = undefined;
          const response = await request("/events", { signal: abort.signal });
          if (!response.ok || !response.body)
            throw new Error("Assistant unavailable");
          if (abort.signal.aborted) {
            await response.body.cancel();
            return;
          }
          handlers.open();
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let pending = "";
          try {
            while (!abort.signal.aborted) {
              const chunk = await reader.read();
              if (chunk.done) break;
              pending += decoder.decode(chunk.value, { stream: true });
              let end: number;
              while ((end = pending.indexOf("\n\n")) !== -1) {
                const frame = pending.slice(0, end);
                pending = pending.slice(end + 2);
                const data = frame
                  .split("\n")
                  .filter((line) => line.startsWith("data:"))
                  .map((line) => line.slice(5).trimStart())
                  .join("\n");
                if (data) handlers.message(data);
              }
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
        } catch {
          /* Reconnect below, including after the sidecar restarts. */
        }
        if (!abort.signal.aborted) {
          handlers.error();
          retry = setTimeout(() => void run(), 1_500);
        }
      };
      void run();
      return () => {
        abort.abort();
        clearTimeout(retry);
      };
    },
  };
}
