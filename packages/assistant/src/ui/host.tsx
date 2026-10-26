import { createContext, useContext, type ReactNode } from "react";

import { AssistantScope } from "../scope";
export { AssistantScope } from "../scope";

export enum AssistantSurface {
  Floating = "floating",
  Embedded = "embedded",
}

export type AssistantHost = {
  surface?: AssistantSurface;
  scope: AssistantScope;
  imageUrl?(path: string): string;
  request(path: string, init?: RequestInit): Promise<Response>;
  subscribe(handlers: {
    open(): void;
    error(): void;
    message(data: string): void;
  }): () => void;
};

export const browserHost: AssistantHost = {
  scope:
    typeof location !== "undefined" &&
    new URLSearchParams(location.search).get("scope") === AssistantScope.Library
      ? AssistantScope.Library
      : AssistantScope.Meeting,
  imageUrl: (path) => path,
  request: (path, init) => fetch(path, init),
  subscribe(handlers) {
    const source = new EventSource("/events");
    source.onopen = handlers.open;
    source.onerror = handlers.error;
    source.onmessage = (event: MessageEvent<string>) =>
      handlers.message(event.data);
    return () => source.close();
  },
};

const Context = createContext<AssistantHost>(browserHost);
export function AssistantHostProvider({
  host,
  children,
}: {
  host: AssistantHost;
  children: ReactNode;
}) {
  return <Context value={host}>{children}</Context>;
}
export const useAssistantHost = () => useContext(Context);
