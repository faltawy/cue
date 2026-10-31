import { type Attention } from "@anlg/assistant/attention";

import { adapterFor } from "./adapters";
import { createAttentionLayer } from "./attention";
import { dockRect, moveTo, PanelDock, placeAt } from "./dock";
import { PanelFrameEvent, PanelHostEvent } from "./protocol";

const DOCK_KEY = "panelDock";

export type DockStore = {
  load(): Promise<unknown>;
  save(dock: PanelDock): void;
};

const isDock = (value: unknown): value is PanelDock =>
  Object.values(PanelDock).includes(value as PanelDock);

export function mountCoachPanel({
  panelUrl = chrome.runtime.getURL("panel.html"),
  panelOrigin = `chrome-extension://${chrome.runtime.id}`,
  enabled = () => adapterFor(location.href) !== undefined,
  store = {
    load: () =>
      chrome.storage.local.get(DOCK_KEY).then((saved) => saved[DOCK_KEY]),
    save: (dock) =>
      void chrome.storage.local
        .set({ [DOCK_KEY]: dock })
        .catch(() => undefined),
  },
}: {
  panelUrl?: string;
  panelOrigin?: string;
  enabled?: () => boolean;
  store?: DockStore;
} = {}) {
  document
    .querySelectorAll("[data-cue-coach-root]")
    .forEach((element) => element.remove());
  let container: HTMLElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let attention: ReturnType<typeof createAttentionLayer> | undefined;
  let dock = PanelDock.Bottom;
  let collapsed = true;
  let connected = false;

  const tell = () =>
    frame?.contentWindow?.postMessage(
      { kind: PanelHostEvent.Layout, dock, collapsed },
      panelOrigin,
    );
  const layout = (animated: boolean) => {
    tell();
    if (!container) return;
    const rect = dockRect(
      dock,
      {
        collapsed,
        connected,
        rtl: getComputedStyle(document.documentElement).direction === "rtl",
      },
      { width: innerWidth, height: innerHeight },
    );
    if (animated) void moveTo(container, rect);
    else placeAt(container, rect);
  };
  const setCollapsed = (next: boolean) => {
    if (next === collapsed) return;
    collapsed = next;
    layout(true);
  };
  const remove = () => {
    attention?.dispose();
    attention = undefined;
    container?.remove();
    container = undefined;
    frame = undefined;
  };
  const sync = () => {
    if (!enabled()) {
      remove();
      return;
    }
    if (container?.isConnected) return;
    container = document.createElement("div");
    container.setAttribute("data-cue-coach-root", "");
    container.setAttribute("popover", "manual");
    container.style.cssText =
      "position:fixed;right:auto;bottom:auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;";
    const root = container.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    // Matches the panel's dark surface and border tokens so nothing flashes while it loads.
    style.textContent = `
      :host { color-scheme:dark; }
      iframe { display:block; box-sizing:border-box; width:100%; height:100%; border:1px solid #292929; border-radius:12px; background:#161616; box-shadow:0 10px 15px -3px rgb(0 0 0 / .35),0 4px 6px -4px rgb(0 0 0 / .35); }
    `;
    frame = document.createElement("iframe");
    frame.title = "Cue meeting coach";
    frame.src = panelUrl;
    root.append(style, frame);
    // Mounted first inside the coach's own top-layer root so highlights always sit beneath the coach.
    attention = createAttentionLayer({
      anchor: container,
      isExpanded: () => !collapsed,
      open: () => setCollapsed(false),
      mount: (layer) => root.prepend(layer),
    });
    document.body.append(container);
    container.showPopover();
    layout(false);
  };
  const receive = (event: MessageEvent) => {
    if (
      event.origin !== panelOrigin ||
      !frame ||
      event.source !== frame.contentWindow
    )
      return;
    const data: unknown = event.data;
    if (typeof data !== "object" || data === null || !("kind" in data)) return;
    if (data.kind === PanelFrameEvent.Ready) tell();
    else if (data.kind === PanelFrameEvent.Layout) {
      const next = "connected" in data && data.connected === true;
      if (connected && !next) attention?.clear();
      if (next === connected) return;
      connected = next;
      layout(true);
    } else if (
      data.kind === PanelFrameEvent.Dock &&
      "dock" in data &&
      isDock(data.dock) &&
      data.dock !== dock
    ) {
      dock = data.dock;
      store.save(dock);
      layout(true);
    } else if (
      data.kind === PanelFrameEvent.Collapse &&
      "collapsed" in data &&
      typeof data.collapsed === "boolean"
    )
      setCollapsed(data.collapsed);
  };
  const resize = () => layout(false);
  window.addEventListener("message", receive);
  window.addEventListener("resize", resize);
  void store
    .load()
    .then((saved) => {
      if (!isDock(saved) || saved === dock) return;
      dock = saved;
      layout(false);
    })
    .catch(() => undefined);
  sync();
  const timer = setInterval(sync, 1000);
  return {
    attention(cue: Attention) {
      attention?.show(cue);
    },
    minimize() {
      setCollapsed(true);
    },
    open() {
      sync();
      setCollapsed(false);
    },
    close() {
      clearInterval(timer);
      window.removeEventListener("message", receive);
      window.removeEventListener("resize", resize);
      remove();
    },
  };
}
