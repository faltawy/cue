import { type Attention } from "@anlg/assistant/attention";

import { adapterFor } from "./adapters";
import { createAttentionLayer } from "./attention";
import { PanelFrameEvent } from "./protocol";

export function mountCoachPanel() {
  document
    .querySelectorAll("[data-cue-coach-root]")
    .forEach((element) => element.remove());
  let container: HTMLElement | undefined;
  let frame: HTMLIFrameElement | undefined;
  let toggle: HTMLButtonElement | undefined;
  let expanded = false;
  let attention: ReturnType<typeof createAttentionLayer> | undefined;
  const remove = () => {
    attention?.dispose();
    attention = undefined;
    container?.remove();
    container = undefined;
    frame = undefined;
    toggle = undefined;
  };
  const render = () => {
    container?.toggleAttribute("data-open", expanded);
    toggle?.setAttribute("aria-expanded", String(expanded));
    toggle?.setAttribute(
      "aria-label",
      expanded ? "Minimize coach" : "Open coach",
    );
    if (toggle) toggle.title = expanded ? "Minimize coach" : "Open coach";
    if (frame) {
      frame.inert = !expanded;
      frame.setAttribute("aria-hidden", String(!expanded));
    }
  };
  const sync = () => {
    if (!adapterFor(location.href)) {
      remove();
      return;
    }
    if (container?.isConnected) return;
    container = document.createElement("div");
    container.setAttribute("data-cue-coach-root", "");
    container.setAttribute("popover", "manual");
    container.style.cssText =
      "position:fixed;inset:auto 20px 88px auto;margin:0;padding:0;border:0;background:transparent;overflow:visible;pointer-events:none;";
    const root = container.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { color-scheme:dark; }
      .panel { opacity:0; visibility:hidden; transform:translateY(8px) scale(.97); transform-origin:bottom right; pointer-events:none; transition:opacity 140ms ease-out,transform 180ms cubic-bezier(.2,.8,.2,1),visibility 0s 180ms; }
      :host([data-open]) .panel { opacity:1; visibility:visible; transform:translateY(0) scale(1); pointer-events:auto; transition-delay:0s; }
      iframe { display:block; width:min(380px, calc(100vw - 40px)); height:min(var(--panel-height, 320px), calc(100dvh - 160px)); border:1px solid #3b3b3b; border-radius:12px; background:#191919; transition:height 180ms cubic-bezier(.2,.8,.2,1); }
      .toolbar { display:flex; justify-content:flex-end; margin-top:10px; }
      button { display:grid; place-items:center; width:40px; height:40px; padding:0; cursor:pointer; pointer-events:auto; border:1px solid #454545; border-radius:50%; background:#242424; color:#dededb; transition:background 120ms ease-out; }
      button:hover { background:#343434; }
      button:focus-visible { outline:2px solid #d2a25c; outline-offset:3px; }
      img { width:24px; height:24px; border-radius:6px; }
      .chevron { display:none; width:18px; height:18px; }
      :host([data-open]) img { display:none; }
      :host([data-open]) .chevron { display:block; }
      @media(prefers-reduced-motion:reduce) { .panel,iframe,button { transition:none; } }
    `;
    const panel = document.createElement("div");
    panel.className = "panel";
    frame = document.createElement("iframe");
    frame.title = "Cue meeting coach";
    frame.src = chrome.runtime.getURL("panel.html");
    panel.append(frame);
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toggle = document.createElement("button");
    toggle.type = "button";
    const icon = document.createElement("img");
    icon.src = chrome.runtime.getURL("cue-mark.svg");
    icon.alt = "";
    const chevron = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    chevron.setAttribute("viewBox", "0 0 24 24");
    chevron.setAttribute("class", "chevron");
    chevron.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m6 9 6 6 6-6");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.75");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    chevron.append(path);
    toggle.append(icon, chevron);
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      render();
    });
    attention = createAttentionLayer(toggle, () => expanded);
    toolbar.append(toggle);
    root.append(style, panel, toolbar);
    document.body.append(container);
    container.showPopover();
    render();
  };
  let connected = false;
  const layout = (event: MessageEvent) => {
    if (
      event.origin !== `chrome-extension://${chrome.runtime.id}` ||
      event.source !== frame?.contentWindow
    )
      return;
    if (event.data?.kind !== PanelFrameEvent.Layout) return;
    if (connected && event.data.connected !== true) attention?.clear();
    connected = event.data.connected === true;
    container?.style.setProperty(
      "--panel-height",
      event.data.connected === true
        ? event.data.toolsOpen === true
          ? "680px"
          : "520px"
        : "320px",
    );
  };
  window.addEventListener("message", layout);
  sync();
  const timer = setInterval(sync, 1000);
  return {
    attention(cue: Attention) {
      attention?.show(cue);
    },
    minimize() {
      expanded = false;
      render();
    },
    open() {
      expanded = true;
      sync();
      render();
    },
    close() {
      clearInterval(timer);
      window.removeEventListener("message", layout);
      remove();
    },
  };
}
