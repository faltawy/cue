import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@anlg/assistant/ui/app";

import { createCoachHost } from "./coach-host";
import { ErrorCode } from "./errors";
import {
  hostChannel,
  useHostLayout,
  usePublishConnected,
} from "./panel/host-layout";
import { MeetPanel, type PanelActions } from "./panel/meet-panel";
import {
  AppLinkState,
  ConnectionState,
  PanelAction,
  meetingUrl,
  type PanelState,
} from "./protocol";

const MEET_ORIGIN = "https://meet.google.com";
const embedded = window.parent !== window;

const postToMeet = hostChannel(MEET_ORIGIN, embedded);

async function send(
  action: PanelAction,
  options: { screens?: boolean; offerId?: string; useCurrent?: boolean } = {},
): Promise<PanelState> {
  const window = await chrome.windows.getCurrent();
  return chrome.runtime.sendMessage({
    action,
    windowId: window.id,
    ...options,
  });
}

function useCurrentTab() {
  const [tab, setTab] = useState({
    supported: embedded,
    id: undefined as number | undefined,
  });
  useEffect(() => {
    if (embedded) return;
    let windowId: number | undefined;
    const update = async () => {
      const current = await chrome.windows.getCurrent();
      windowId = current.id;
      const [active] = await chrome.tabs.query({ active: true, windowId });
      setTab({ supported: !!meetingUrl(active?.url), id: active?.id });
    };
    const activated = ({ windowId: changed }: { windowId: number }) => {
      if (changed === windowId) void update();
    };
    const updated = () => void update();
    chrome.tabs.onActivated.addListener(activated);
    chrome.tabs.onUpdated.addListener(updated);
    void update();
    return () => {
      chrome.tabs.onActivated.removeListener(activated);
      chrome.tabs.onUpdated.removeListener(updated);
    };
  }, []);
  return tab;
}

function useDebugMode() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void chrome.storage.local
      .get("debugEnabled")
      .then((settings) => setEnabled(settings.debugEnabled === true));
    const changed = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes.debugEnabled)
        setEnabled(changes.debugEnabled.newValue === true);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  return enabled;
}

function useCoach(state: PanelState | null) {
  const generation =
    state?.connection === ConnectionState.Connected ? state.generation : null;
  const [issue, setIssue] = useState<ErrorCode | null>(null);
  const [coach, setCoach] = useState<ReturnType<typeof createCoachHost> | null>(
    null,
  );
  useEffect(() => {
    setIssue(null);
    if (!generation) {
      setCoach(null);
      return;
    }
    const host = createCoachHost(
      generation,
      fetch,
      (attention) => {
        if (embedded)
          void chrome.runtime
            .sendMessage({
              action: PanelAction.Attention,
              generation,
              attention,
            })
            .catch(() => undefined);
      },
      setIssue,
    );
    setCoach(host);
    return () => host.close();
  }, [generation]);
  return { coach: generation ? coach : null, generation, issue };
}

function Panel() {
  const [state, setState] = useState<PanelState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [layout, changeLayout] = useHostLayout(MEET_ORIGIN, embedded);
  const tab = useCurrentTab();
  const debugEnabled = useDebugMode();
  const { coach, generation, issue } = useCoach(state);
  const latest = useRef(state);
  latest.current = state;

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "cue-panel" });
    port.onMessage.addListener((next: PanelState) => setState(next));
    port.onDisconnect.addListener(() => {
      setState(
        (current) =>
          current && {
            ...current,
            connection: ConnectionState.Ready,
            appLink: {
              ...current.appLink,
              status: AppLinkState.Offline,
              latencyMs: null,
            },
          },
      );
      setFailure(
        "The extension restarted. Close this panel and reopen it from the toolbar.",
      );
    });
    return () => port.disconnect();
  }, []);

  useEffect(() => {
    void run(PanelAction.Refresh);
  }, [tab.id]);

  const connected = state?.connection === ConnectionState.Connected;
  usePublishConnected(postToMeet, connected);

  async function run(
    action: PanelAction,
    options: { screens?: boolean; offerId?: string; useCurrent?: boolean } = {},
  ) {
    setBusy(true);
    try {
      setState(await send(action, options));
    } catch {
      setFailure(
        "The extension restarted. Close this panel and reopen it from the toolbar.",
      );
    } finally {
      setBusy(false);
    }
  }

  const offerId = () => latest.current?.recordingOffer?.id;
  const actions: PanelActions = {
    connect: () => void run(PanelAction.Connect),
    disconnect: () => void run(PanelAction.Disconnect),
    refresh: () => void run(PanelAction.Refresh),
    focusMeeting: () => void run(PanelAction.FocusMeeting),
    confirmRecording: (useCurrent) =>
      void run(PanelAction.ConfirmRecording, {
        offerId: offerId(),
        ...(useCurrent ? { useCurrent: true } : {}),
      }),
    dismissRecording: () =>
      void run(PanelAction.DismissRecording, { offerId: offerId() }),
    screens: (screens) => void run(PanelAction.Screens, { screens }),
    testHighlight: () => void run(PanelAction.TestHighlight),
    testAttention: () => void run(PanelAction.TestAttention),
    setDebug: (on) => void chrome.storage.local.set({ debugEnabled: on }),
    clearDebug: () =>
      void chrome.runtime.sendMessage({ action: PanelAction.DebugClear }),
    exportDebug: () =>
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
        }),
  };

  return (
    <MeetPanel
      state={state}
      embedded={embedded}
      supportedTab={tab.supported}
      showBackToMeeting={!embedded && connected && tab.id !== state?.tabId}
      busy={busy}
      failure={failure}
      coachIssue={issue}
      debugEnabled={debugEnabled}
      layout={layout}
      onLayout={changeLayout}
      actions={actions}
      renderCoach={(slot) =>
        coach && <App key={generation} host={coach.host} {...slot} />
      }
    />
  );
}

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );
