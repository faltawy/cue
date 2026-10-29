import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { CaptureAvailability } from "@anlg/assistant/browser-context";
import { App } from "@anlg/assistant/ui/app";

import { createCoachHost } from "./coach-host";
import { ErrorCode } from "./errors";
import { MeetingPhase } from "./lifecycle";
import {
  AppLinkState,
  ConnectionState,
  PanelAction,
  PanelFrameEvent,
  meetingUrl,
  type PanelState,
} from "./protocol";

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing panel element: ${id}`);
  return result as T;
}
const connect = element<HTMLButtonElement>("connect");
const refresh = element<HTMLButtonElement>("refresh");
const screens = element<HTMLInputElement>("screens");
let connected = false;
const embedded = window.parent !== window;
let supportedTab = embedded;
let currentTabId: number | undefined;
let panelWindowId: number | undefined;
let cueKey = "";
let busy = false;
let lastState: PanelState | null = null;
const coachRoot = createRoot(element("coach"));
let coach: ReturnType<typeof createCoachHost> | null = null;
let coachGeneration: string | null = null;
function syncCoach(state: PanelState) {
  const next =
    state.connection === ConnectionState.Connected ? state.generation : null;
  if (next === coachGeneration) return;
  coach?.close();
  coachRoot.render(null);
  element("coach-error").hidden = true;
  coachGeneration = next;
  coach = next
    ? createCoachHost(
        next,
        fetch,
        (attention) => {
          if (embedded && coachGeneration === next)
            void chrome.runtime
              .sendMessage({
                action: PanelAction.Attention,
                generation: next,
                attention,
              })
              .catch(() => undefined);
        },
        (code) => {
          const issue = element("coach-error");
          issue.hidden = code === null;
          issue.textContent = code
            ? `${code} — Cue is reachable, but meeting chat is unavailable. Retrying automatically.`
            : "";
        },
      )
    : null;
  element("coach").hidden = !coach;
  document.body.classList.toggle("meeting-connected", !!coach);
  if (coach)
    coachRoot.render(createElement(App, { key: next, host: coach.host }));
}

function renderHeartbeat() {
  const link = lastState?.appLink;
  const age = link?.checkedAt
    ? Math.floor((Date.now() - link.checkedAt) / 1000)
    : null;
  const stale = age !== null && age > 15;
  const online = link?.status === AppLinkState.Online && !stale;
  element("app-connection").textContent =
    `${online ? "Connected to Cue" : stale ? "Checking connection…" : link?.status === AppLinkState.Offline ? "Cue is offline" : "Connecting to Cue…"}`;
  element("status-dot").classList.toggle("connected", online);
  element("heartbeat").textContent =
    age === null
      ? "Waiting for the first response"
      : `Checked ${age}s ago${link?.latencyMs !== null ? ` · ${link?.latencyMs} ms round trip` : ""}`;
}
setInterval(renderHeartbeat, 1000);

function publishLayout() {
  if (!embedded) return;
  window.parent.postMessage(
    {
      kind: PanelFrameEvent.Layout,
      connected,
      toolsOpen: document.querySelector("[data-meeting-tools][open]") !== null,
    },
    "https://meet.google.com",
  );
}

document.addEventListener(
  "toggle",
  (event) => {
    if (
      event.target instanceof HTMLDetailsElement &&
      event.target.hasAttribute("data-meeting-tools")
    )
      publishLayout();
  },
  true,
);

function render(state: PanelState) {
  syncCoach(state);
  lastState = state;
  renderHeartbeat();
  const offer = state.recordingOffer;
  element("recording-prompt").hidden = !offer;
  element("meeting-title").hidden = !!offer;
  element("description").hidden = !!offer;
  if (offer) {
    element("recording-question").textContent = offer.expectedSession
      ? offer.paused && offer.canUseCurrent
        ? "Resume this recording?"
        : "Record this meeting separately?"
      : "Record this meeting?";
    element("recording-detail").textContent = offer.expectedSession
      ? `Cue has “${offer.recordingTitle || "another meeting"}” open. Finish it and start a new recording for this call?`
      : "Cue will record this call and connect your coach.";
    element("record-new").textContent = offer.expectedSession
      ? "Finish current & record this"
      : "Start recording";
    element("record-current").hidden = !offer.canUseCurrent;
    element("record-current").textContent = offer.paused
      ? "Resume current recording"
      : "Use current recording";
    for (const id of ["record-new", "record-current", "record-dismiss"])
      element<HTMLButtonElement>(id).disabled =
        busy || state.connection === ConnectionState.Connecting;
  }
  connected = state.connection === ConnectionState.Connected;
  publishLayout();
  element("connection").textContent = connected
    ? "Meeting connected"
    : state.connection === ConnectionState.Connecting
      ? "Connecting meeting…"
      : "Meeting not connected";
  if (connected && state.phase !== MeetingPhase.InMeeting)
    element("connection").textContent =
      state.phase === MeetingPhase.Reconnecting
        ? "Meet is reconnecting — context paused"
        : "Meeting state unclear — context paused";
  element("connection").classList.toggle("connected", connected);
  element("meeting-title").textContent = connected
    ? state.title || "Your meeting"
    : "Your coach, here.";
  element("back-to-meeting").hidden =
    embedded || !connected || currentTabId === state.tabId;
  element("description").textContent = connected
    ? "Keep listening. Your coach will speak up here when there’s something useful."
    : !supportedTab
      ? "Open a Google Meet call in this window to connect. You can browse other tabs after connecting."
      : state.recordingTitle
        ? `Connect this call to “${state.recordingTitle}”.`
        : "Start a recording in Cue, then connect this call to chat with your coach.";
  const appIssue = state.appLink.status === AppLinkState.Offline;
  const message = appIssue ? state.appLink.error : state.error;
  const code = appIssue ? state.appLink.errorCode : state.errorCode;
  const error = element("error");
  error.hidden = !message;
  error.textContent = message
    ? `${code ?? ErrorCode.RequestFailed} — ${message}`
    : "";
  element("connect-label").textContent = connected
    ? "Disconnect meeting"
    : "Connect meeting";
  connect.hidden = !!offer || (!connected && !supportedTab);
  connect.disabled = busy || state.connection === ConnectionState.Connecting;
  refresh.hidden = connected;
  screens.checked = state.screens;
  const coverage = state.coverage;
  element("coverage-summary").textContent = coverage
    ? "Available sources"
    : "Not connected";
  for (const key of ["captions", "chat"] as const)
    element(key).textContent =
      coverage?.[key] === CaptureAvailability.Available
        ? "Available"
        : "Not visible";
  element("people").textContent = coverage
    ? String(coverage.participants)
    : "—";
  element("screen").textContent = !state.screens
    ? "Off"
    : coverage?.screen
      ? "Captured"
      : "No presentation found";
  const key = JSON.stringify([
    connected,
    state.cues.map((cue) => [cue.sequence, cue.line]),
  ]);
  if (key !== cueKey) {
    cueKey = key;
    const list = element("cues");
    list.replaceChildren();
    for (const cue of state.cues.slice(-3).reverse()) {
      const item = document.createElement("article");
      item.className = "cue";
      const line = document.createElement("p");
      line.dir = "auto";
      line.textContent = cue.line;
      const time = document.createElement("time");
      time.dateTime = new Date(cue.receivedAt).toISOString();
      time.textContent = new Date(cue.receivedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      item.append(line, time);
      list.append(item);
    }
    if (!state.cues.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = connected
        ? "No new cues. Keep listening."
        : "Connect a meeting to receive private cues.";
      list.append(empty);
    }
  }
}
async function action(
  action: PanelAction,
  options: { screens?: boolean; offerId?: string; useCurrent?: boolean } = {},
) {
  busy = true;
  connect.disabled = true;
  try {
    const window = await chrome.windows.getCurrent();
    const state: PanelState = await chrome.runtime.sendMessage({
      action,
      windowId: window.id,
      ...options,
    });
    busy = false;
    render(state);
  } catch {
    const error = element("error");
    error.hidden = false;
    error.textContent =
      "The extension restarted. Close this panel and open Cue again from the toolbar.";
  } finally {
    busy = false;
    connect.disabled = false;
  }
}
element("back-to-meeting").addEventListener(
  "click",
  () => void action(PanelAction.FocusMeeting),
);
connect.addEventListener(
  "click",
  () => void action(connected ? PanelAction.Disconnect : PanelAction.Connect),
);
element("test-highlight").addEventListener(
  "click",
  () => void action(PanelAction.TestHighlight),
);
element("record-new").addEventListener(
  "click",
  () =>
    void action(PanelAction.ConfirmRecording, {
      offerId: lastState?.recordingOffer?.id,
    }),
);
element("record-current").addEventListener(
  "click",
  () =>
    void action(PanelAction.ConfirmRecording, {
      offerId: lastState?.recordingOffer?.id,
      useCurrent: true,
    }),
);
element("record-dismiss").addEventListener(
  "click",
  () =>
    void action(PanelAction.DismissRecording, {
      offerId: lastState?.recordingOffer?.id,
    }),
);
element("test-tooltip").addEventListener(
  "click",
  () => void action(PanelAction.TestAttention),
);
refresh.addEventListener("click", () => void action(PanelAction.Refresh));
screens.addEventListener(
  "change",
  () => void action(PanelAction.Screens, { screens: screens.checked }),
);
const port = chrome.runtime.connect({ name: "cue-panel" });
port.onMessage.addListener(render);
port.onDisconnect.addListener(() => {
  coach?.close();
  coachRoot.render(null);
  element("coach-error").hidden = true;
  if (lastState) {
    lastState.appLink.status = AppLinkState.Offline;
    lastState.appLink.latencyMs = null;
  }
  renderHeartbeat();
  const error = element("error");
  error.hidden = false;
  error.textContent = `${ErrorCode.ExtensionRestarted} — Close this panel and reopen it from the toolbar.`;
});
async function updateTab() {
  if (embedded) return;
  const window = await chrome.windows.getCurrent();
  panelWindowId = window.id;
  const [tab] = await chrome.tabs.query({ active: true, windowId: window.id });
  supportedTab = !!meetingUrl(tab?.url);
  currentTabId = tab?.id;
  if (lastState) render(lastState);
}
chrome.tabs.onActivated.addListener(({ windowId }) => {
  if (windowId === panelWindowId) void updateTab();
});
chrome.tabs.onUpdated.addListener((tabId) => {
  if (tabId === currentTabId) void updateTab();
});
void updateTab().then(() => action(PanelAction.Refresh));

const debugMode = element<HTMLInputElement>("debug-mode");
function renderDebug(enabled: boolean) {
  debugMode.checked = enabled;
  element("debug-controls").hidden = !enabled;
}
void chrome.storage.local
  .get("debugEnabled")
  .then((settings) => renderDebug(settings.debugEnabled === true));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.debugEnabled)
    renderDebug(changes.debugEnabled.newValue === true);
});
debugMode.addEventListener("change", () => {
  void chrome.storage.local.set({ debugEnabled: debugMode.checked });
});
element("debug-clear").addEventListener("click", () => {
  void chrome.runtime.sendMessage({ action: PanelAction.DebugClear });
});
element("debug-export").addEventListener("click", () => {
  void chrome.runtime
    .sendMessage({ action: PanelAction.DebugExport })
    .then((report) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "cue-extension-diagnostics.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
});
