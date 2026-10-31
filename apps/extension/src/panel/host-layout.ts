import { useEffect, useState } from "react";

import { PanelDock } from "../dock";
import { PanelFrameEvent, PanelHostEvent } from "../protocol";
import { type PanelLayout } from "./meet-panel";

// The page that frames the panel (Meet, or the dev preview) owns its position; the panel only asks.
export function hostChannel(hostOrigin: string, embedded: boolean) {
  return (message: Record<string, unknown>) => {
    if (embedded) window.parent.postMessage(message, hostOrigin);
  };
}

export function useHostLayout(hostOrigin: string, embedded: boolean) {
  const post = hostChannel(hostOrigin, embedded);
  const [layout, setLayout] = useState<PanelLayout>({
    dock: PanelDock.Bottom,
    collapsed: embedded,
  });
  useEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== hostOrigin) return;
      const data = event.data;
      if (
        data?.kind === PanelHostEvent.Layout &&
        Object.values(PanelDock).includes(data.dock) &&
        typeof data.collapsed === "boolean"
      )
        setLayout({ dock: data.dock, collapsed: data.collapsed });
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ kind: PanelFrameEvent.Ready }, hostOrigin);
    return () => window.removeEventListener("message", receive);
  }, [embedded, hostOrigin]);
  const change = (next: Partial<PanelLayout>) => {
    if (next.dock) post({ kind: PanelFrameEvent.Dock, dock: next.dock });
    if (next.collapsed !== undefined)
      post({ kind: PanelFrameEvent.Collapse, collapsed: next.collapsed });
  };
  return [layout, change] as const;
}

export function usePublishConnected(
  post: ReturnType<typeof hostChannel>,
  connected: boolean,
) {
  useEffect(() => {
    post({ kind: PanelFrameEvent.Layout, connected });
  }, [connected]);
}
