import { fetch as nativeFetch } from "@tauri-apps/plugin-http";

import { AssistantScope } from "@anlg/assistant/scope";
import { subscribeCoachEvents } from "@anlg/assistant/ui/event-stream";
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
    subscribe: (handlers) =>
      subscribeCoachEvents(request, handlers, () => {
        endpoint = undefined;
      }),
  };
}
