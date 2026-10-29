import {
  BrowserFailure,
  CaptureAvailability,
} from "@anlg/assistant/browser-context";

import { adapterFor } from "./adapters";
import {
  debug,
  DebugEvent,
  debugEnabled,
  initializeDebug,
  exportDebug,
  clearDebug,
} from "./debug";
import { diagnostic, ErrorCode, ExtensionError } from "./errors";
import { MeetingPhase } from "./lifecycle";
import { probeMeeting } from "./meeting-probe";
import { NativeClient } from "./native-client";
import {
  AppLinkState,
  ConnectionState,
  ContentAction,
  contentSchema,
  meetingUrl,
  Operation,
  PanelAction,
  panelActionSchema,
  panelStateForTab,
  type PanelState,
  type RecordingOffer,
  ReplyKind,
} from "./protocol";

const state: PanelState = {
  appLink: {
    status: AppLinkState.Checking,
    host: "Cue",
    checkedAt: null,
    latencyMs: null,
    error: null,
    errorCode: null,
  },
  errorCode: null,
  connection: ConnectionState.Offline,
  error: null,
  activeSession: null,
  generation: null,
  tabId: null,
  title: "",
  screens: true,
  phase: MeetingPhase.Unknown,
  recordingTitle: null,
  coverage: null,
  cues: [],
};
let client: NativeClient | null = null;
let active: {
  tabId: number;
  meetingUrl: string;
  sessionId: string;
  bindingId: string;
  generation: string;
  sequence: number;
  after: number;
} | null = null;
let pendingSnapshot: Extract<
  ReturnType<typeof contentSchema.parse>,
  { kind: ContentAction.Snapshot }
> | null = null;
let pumping = false;
let tickRunning = false;
let timer: ReturnType<typeof setInterval> | null = null;
let connecting = false;
let epoch = 0;
const panels = new Set<chrome.runtime.Port>();
const offers = new Map<number, RecordingOffer>();
const dismissed = new Map<number, string>();
let activeMeetingUrl: string | null = null;
let recordingPaused = false;
let recordingSupported = false;
function stateForTab(tabId?: number): PanelState {
  return {
    ...panelStateForTab(state, tabId),
    recordingOffer: tabId === undefined ? null : (offers.get(tabId) ?? null),
  };
}

function broadcast() {
  state.generation = active?.generation ?? null;
  state.cues = state.cues
    .filter((cue) => Date.now() - cue.receivedAt < 60_000)
    .slice(-5);
  for (const port of panels) {
    try {
      port.postMessage(stateForTab(port.sender?.tab?.id));
    } catch {
      panels.delete(port);
    }
  }
}
async function native() {
  if (!client) {
    const config: unknown = await (
      await fetch(chrome.runtime.getURL("host.json"))
    ).json();
    if (
      !config ||
      typeof config !== "object" ||
      !("host" in config) ||
      (config.host !== "com.hyprnote.stable.browser" &&
        config.host !== "com.hyprnote.dev.browser")
    )
      throw new ExtensionError(
        ErrorCode.Setup,
        "Prepare the extension again from Cue.",
      );
    state.appLink.host =
      config.host === "com.hyprnote.dev.browser" ? "Cue Dev" : "Cue";
    client ??= new NativeClient(config.host);
  }
  return client;
}
let heartbeat: ReturnType<typeof setInterval> | null = null;
let pingPending: Promise<string | null> | null = null;
async function ping(): Promise<string | null> {
  if (pingPending) return pingPending;
  pingPending = (async () => {
    const started = performance.now();
    try {
      const reply = await (await native()).request({ kind: Operation.Status });
      if (reply.kind !== Operation.Status)
        throw new ExtensionError(
          ErrorCode.Protocol,
          "Unexpected Cue response. Update Cue.",
        );
      const wasOffline = state.appLink.status !== AppLinkState.Online;
      if (
        state.appLink.errorCode &&
        state.errorCode === state.appLink.errorCode
      ) {
        state.error = null;
        state.errorCode = null;
      }
      state.activeSession = reply.active_session_id;
      activeMeetingUrl = reply.active_meeting_url ?? null;
      recordingPaused = reply.paused ?? false;
      recordingSupported = reply.recording_supported === true;
      state.recordingTitle = reply.active_session_title ?? null;
      state.appLink = {
        ...state.appLink,
        status: AppLinkState.Online,
        checkedAt: Date.now(),
        latencyMs: Math.round(performance.now() - started),
        error: null,
        errorCode: null,
      };
      if (wasOffline)
        console.info("cue_app_reachable", {
          host: state.appLink.host,
          duration_ms: state.appLink.latencyMs,
        });
      return reply.active_session_id;
    } catch (error) {
      const issue = diagnostic(error);
      if (
        state.appLink.status !== AppLinkState.Offline ||
        state.appLink.errorCode !== issue.code
      )
        console.warn("cue_app_unreachable", {
          code: issue.code,
          duration_ms: Math.round(performance.now() - started),
        });
      state.activeSession = null;
      state.recordingTitle = null;
      state.appLink = {
        ...state.appLink,
        status: AppLinkState.Offline,
        checkedAt: Date.now(),
        latencyMs: null,
        error: issue.message,
        errorCode: issue.code,
      };
      client?.close();
      client = null;
      throw error;
    } finally {
      broadcast();
    }
  })();
  try {
    return await pingPending;
  } finally {
    pingPending = null;
  }
}
async function refresh(windowId?: number) {
  const sessionId = await ping();
  if (!active && windowId !== undefined) {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    const probe =
      tab?.id && tab.url && adapterFor(tab.url)
        ? await chrome.tabs
            .sendMessage(tab.id, { kind: ContentAction.Probe })
            .catch(() => null)
        : null;
    state.phase = probe?.phase ?? MeetingPhase.Unknown;
  }
  state.connection = active ? ConnectionState.Connected : ConnectionState.Ready;
  state.error = null;
  state.errorCode = null;
  return sessionId;
}
async function stop() {
  epoch++;
  const previous = active;
  active = null;
  pendingSnapshot = null;
  if (timer) clearInterval(timer);
  timer = null;
  state.tabId = null;
  state.title = "";
  state.coverage = null;
  state.cues = [];
  state.connection = ConnectionState.Ready;
  broadcast();
  if (previous) {
    await chrome.tabs
      .sendMessage(previous.tabId, {
        kind: ContentAction.Stop,
        generation: previous.generation,
      })
      .catch(() => undefined);
    await client
      ?.request({ kind: Operation.Detach, binding_id: previous.bindingId })
      .catch(() => undefined);
  }
  if (!panels.size) {
    client?.close();
    client = null;
  }
  broadcast();
}
async function fail(error: unknown) {
  await stop();
  state.connection =
    state.appLink.status === AppLinkState.Online
      ? ConnectionState.Ready
      : ConnectionState.Offline;
  const issue = diagnostic(error);
  debug(DebugEvent.Connection, { code: issue.code });
  state.error = issue.message;
  state.errorCode = issue.code;
  console.warn("cue_browser_connection_failed", {
    run_id: crypto.randomUUID(),
    code: issue.code,
  });
  broadcast();
}
async function connect(
  windowId?: number,
  tabId?: number,
  approvedSession?: string,
  automatic = false,
) {
  if (connecting) return;
  const previous = active;
  connecting = true;
  if (!active) state.connection = ConnectionState.Connecting;
  state.error = null;
  state.errorCode = null;
  broadcast();
  try {
    if (windowId === undefined && tabId === undefined)
      throw new ExtensionError(
        ErrorCode.TabMissing,
        "Reopen Cue’s panel in your meeting window, then connect again.",
      );
    const tab =
      tabId !== undefined
        ? await chrome.tabs.get(tabId)
        : (await chrome.tabs.query({ active: true, windowId }))[0];
    const adapter = tab?.url ? adapterFor(tab.url) : undefined;
    const url = adapter && tab?.url ? meetingUrl(tab.url) : null;
    if (!tab?.id)
      throw new ExtensionError(
        ErrorCode.TabMissing,
        "No active tab was found in this panel’s window. Reopen the panel beside Meet.",
      );
    if (!url) {
      state.connection = active
        ? ConnectionState.Connected
        : ConnectionState.Ready;
      state.error = null;
      state.errorCode = null;
      return;
    }
    if (active?.tabId === tab.id && active.meetingUrl === url) {
      state.connection = ConnectionState.Connected;
      return;
    }
    if (
      automatic &&
      (dismissed.get(tab.id) === url || active?.meetingUrl === url)
    )
      return;
    const phase = await probeMeeting(tab.id);
    if (phase !== MeetingPhase.InMeeting)
      throw new ExtensionError(
        ErrorCode.NotJoined,
        "Meet reports a lobby, waiting, ended, or reconnecting state. Connect once the call is active.",
      );
    await ping();
    if (
      !approvedSession &&
      recordingSupported &&
      (activeMeetingUrl !== url || !state.activeSession || recordingPaused)
    ) {
      state.connection = active
        ? ConnectionState.Connected
        : ConnectionState.Ready;
      const prior = offers.get(tab.id);
      if (!automatic || dismissed.get(tab.id) !== url) {
        if (
          !prior ||
          prior.meetingUrl !== url ||
          prior.expectedSession !== state.activeSession ||
          prior.paused !== recordingPaused
        ) {
          offers.set(tab.id, {
            id: crypto.randomUUID(),
            meetingUrl: url,
            expectedSession: state.activeSession,
            title: tab.title ?? "Google Meet",
            recordingTitle: state.recordingTitle,
            canUseCurrent:
              !!state.activeSession &&
              (!activeMeetingUrl || activeMeetingUrl === url),
            paused: recordingPaused,
          });
          await chrome.tabs.sendMessage(tab.id, {
            kind: ContentAction.OpenPanel,
          });
        }
      }
      broadcast();
      return;
    }
    if (
      automatic &&
      (dismissed.get(tab.id) === url || (active && active.meetingUrl === url))
    )
      return;
    offers.delete(tab.id);
    dismissed.delete(tab.id);
    await stop();
    const attempt = epoch;
    const sessionId = await refresh(windowId);
    if (epoch !== attempt) return;
    if (!sessionId) throw new Error(BrowserFailure.NoActiveMeeting);
    if (approvedSession && sessionId !== approvedSession)
      throw new Error(BrowserFailure.MeetingChanged);
    const generation = crypto.randomUUID();
    const reply = await (
      await native()
    ).request({
      kind: Operation.Attach,
      session_id: sessionId,
      connection_id: generation,
      meeting_url: url,
    });
    if (reply.kind !== ReplyKind.Attached)
      throw new Error("Cue could not attach this meeting.");
    if (epoch !== attempt) {
      await client
        ?.request({ kind: Operation.Detach, binding_id: reply.binding_id })
        .catch(() => undefined);
      return;
    }
    active = {
      tabId: tab.id,
      meetingUrl: url,
      sessionId,
      bindingId: reply.binding_id,
      generation,
      sequence: 0,
      after: 0,
    };
    state.tabId = tab.id;
    state.title = tab.title ?? "Google Meet";
    state.connection = ConnectionState.Connected;
    state.phase = MeetingPhase.InMeeting;
    await chrome.tabs.sendMessage(tab.id, {
      kind: ContentAction.Start,
      generation,
      screens: state.screens,
      visualTargets: recordingSupported,
    });
    timer = setInterval(() => void tick(), 2000);
    console.info("cue_browser_meeting_connected", { run_id: generation });
    debug(DebugEvent.Connection, { run_id: generation, code: "connected" });
    broadcast();
  } catch (error) {
    if (active && active === previous) {
      state.connection = ConnectionState.Connected;
      const issue = diagnostic(error);
      state.error = issue.message;
      state.errorCode = issue.code;
      broadcast();
    } else await fail(error);
  } finally {
    connecting = false;
  }
}
async function tick() {
  if (tickRunning || connecting || !active) return;
  tickRunning = true;
  const current = active;
  try {
    const session = await refresh();
    if (active !== current) return;
    if (session !== current.sessionId)
      throw new Error(BrowserFailure.MeetingChanged);
    const reply = await (
      await native()
    ).request({
      kind: Operation.Poll,
      binding_id: current.bindingId,
      after: current.after,
    });
    if (active !== current) return;
    if (reply.kind !== ReplyKind.Cues)
      throw new Error("Cue could not read private cues.");
    for (const cue of reply.cues) {
      if (cue.sequence <= current.after) continue;
      current.after = cue.sequence;
      if (state.phase === MeetingPhase.InMeeting)
        state.cues.push({ ...cue, receivedAt: Date.now() });
    }
    broadcast();
  } catch (error) {
    if (active === current) await fail(error);
  } finally {
    tickRunning = false;
  }
}
async function pump() {
  if (pumping) return;
  pumping = true;
  let sendingFor: typeof active = null;
  try {
    while (active && pendingSnapshot) {
      const snapshot = pendingSnapshot;
      pendingSnapshot = null;
      const current = active;
      sendingFor = current;
      if (snapshot.generation !== current.generation) continue;
      await (
        await native()
      ).request({
        kind: Operation.Snapshot,
        binding_id: current.bindingId,
        sequence: ++current.sequence,
        context: snapshot.context,
      });
      if (active !== current) continue;
      state.title = snapshot.context.title;
      if (state.phase === MeetingPhase.InMeeting)
        state.coverage = {
          captions: snapshot.context.captions,
          chat: snapshot.context.chat,
          participants: snapshot.context.participants.length,
          screen: !!snapshot.context.presentation,
        };
      broadcast();
    }
  } catch (error) {
    if (active === sendingFor) await fail(error);
  } finally {
    pumping = false;
  }
}

async function confirmRecording(
  tabId: number,
  offerId: string | undefined,
  useCurrent: boolean,
) {
  const offer = offers.get(tabId);
  if (connecting || !offer || offer.id !== offerId) return;
  connecting = true;
  state.error = null;
  state.errorCode = null;
  let startedSession: string | undefined;
  try {
    const tab = await chrome.tabs.get(tabId);
    if (
      meetingUrl(tab.url) !== offer.meetingUrl ||
      (await probeMeeting(tabId)) !== MeetingPhase.InMeeting
    )
      throw new Error(BrowserFailure.MeetingChanged);
    if (useCurrent && !offer.canUseCurrent)
      throw new Error(BrowserFailure.InvalidRequest);
    await stop();
    state.connection = ConnectionState.Connecting;
    broadcast();
    const reply = await (
      await native()
    ).request({
      kind: Operation.Record,
      meeting_url: offer.meetingUrl,
      title: offer.title,
      expected_session_id: offer.expectedSession,
      use_current: useCurrent,
    });
    if (reply.kind !== ReplyKind.Recording)
      throw new Error(BrowserFailure.InvalidMessage);
    startedSession = reply.session_id;
    offers.delete(tabId);
    const deadline = Date.now() + 30_000;
    while ((await ping()) !== startedSession) {
      if (Date.now() > deadline)
        throw new ExtensionError(
          ErrorCode.Timeout,
          "Recording has not started. Check Cue for microphone or transcription setup, then retry.",
        );
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const currentTab = await chrome.tabs.get(tabId);
    if (
      meetingUrl(currentTab.url) !== offer.meetingUrl ||
      (await probeMeeting(tabId)) !== MeetingPhase.InMeeting
    )
      throw new Error(BrowserFailure.MeetingChanged);
  } catch (error) {
    if (startedSession && !useCurrent) {
      await client
        ?.request({
          kind: Operation.CancelRecording,
          session_id: startedSession,
          meeting_url: offer.meetingUrl,
        })
        .catch(() => undefined);
    }
    startedSession = undefined;
    const issue = diagnostic(error);
    state.error = issue.message;
    state.errorCode = issue.code;
    state.connection = active
      ? ConnectionState.Connected
      : ConnectionState.Ready;
    console.warn("cue_recording_start_failed", {
      run_id: offer.id,
      code: issue.code,
    });
  } finally {
    connecting = false;
    broadcast();
  }
  if (startedSession) await connect(undefined, tabId, startedSession);
  if (!panels.size && !active && !connecting) {
    client?.close();
    client = null;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  if (
    sender.frameId === 0 &&
    sender.tab?.id !== undefined &&
    meetingUrl(sender.url) &&
    message &&
    typeof message === "object" &&
    "kind" in message &&
    message.kind === ContentAction.Observe
  ) {
    const tabId = sender.tab.id;
    const observed = message as { phase?: unknown; visible?: unknown };
    if (
      recordingSupported &&
      observed.phase === MeetingPhase.InMeeting &&
      observed.visible === true &&
      !connecting &&
      active?.tabId !== tabId
    ) {
      void connect(undefined, tabId, undefined, true);
    } else if (
      observed.phase === MeetingPhase.Ended ||
      observed.phase === MeetingPhase.Lobby
    ) {
      offers.delete(tabId);
      dismissed.delete(tabId);
      broadcast();
    }
    return false;
  }
  if (sender.url === chrome.runtime.getURL("panel.html")) {
    const parsed = panelActionSchema.safeParse(message);
    if (!parsed.success) return false;
    if (parsed.data.action === PanelAction.DebugExport) {
      respond(exportDebug());
      return false;
    }
    if (parsed.data.action === PanelAction.DebugClear) {
      void clearDebug().then(() => respond({ cleared: true }));
      return true;
    }
    if (parsed.data.action === PanelAction.Coach) {
      const current = active;
      if (
        !current ||
        (sender.tab && sender.tab.id !== current.tabId) ||
        parsed.data.generation !== current.generation
      ) {
        respond({ error: ErrorCode.MeetingChanged });
        return false;
      }
      void native()
        .then((client) =>
          client.request({
            kind: Operation.Coach,
            binding_id: current.bindingId,
          }),
        )
        .then((reply) =>
          respond(
            active === current ? reply : { error: ErrorCode.MeetingChanged },
          ),
        )
        .catch((error) => respond({ error: diagnostic(error).code }));
      return true;
    }
    void (async () => {
      try {
        switch (parsed.data.action) {
          case PanelAction.ConfirmRecording:
            if (sender.tab?.id !== undefined)
              await confirmRecording(
                sender.tab.id,
                parsed.data.offerId,
                parsed.data.useCurrent === true,
              );
            break;
          case PanelAction.DismissRecording:
            if (sender.tab?.id !== undefined) {
              const offer = offers.get(sender.tab.id);
              if (offer && offer.id === parsed.data.offerId) {
                dismissed.set(sender.tab.id, offer.meetingUrl);
                offers.delete(sender.tab.id);
              }
            }
            break;
          case PanelAction.TestHighlight:
            if (!debugEnabled()) break;
            if (sender.tab?.id !== undefined && meetingUrl(sender.tab.url))
              await chrome.tabs.sendMessage(sender.tab.id, {
                kind: ContentAction.TestHighlight,
              });
            break;
          case PanelAction.TestAttention:
            if (!debugEnabled()) break;
            if (sender.tab?.id !== undefined && meetingUrl(sender.tab.url))
              await chrome.tabs.sendMessage(sender.tab.id, {
                kind: ContentAction.TestAttention,
              });
            break;
          case PanelAction.Attention:
            if (
              active &&
              sender.tab?.id === active.tabId &&
              parsed.data.generation === active.generation &&
              parsed.data.attention
            ) {
              await chrome.tabs.sendMessage(active.tabId, {
                kind: ContentAction.Attention,
                generation: active.generation,
                attention: parsed.data.attention,
              });
            }
            break;
          case PanelAction.FocusMeeting:
            if (active) {
              const tab = await chrome.tabs.update(active.tabId, {
                active: true,
              });
              if (tab)
                await chrome.windows.update(tab.windowId, { focused: true });
            }
            break;
          case PanelAction.Connect:
            await connect(parsed.data.windowId, sender.tab?.id);
            break;
          case PanelAction.Disconnect:
            if (!sender.tab || sender.tab.id === active?.tabId) {
              if (active) dismissed.set(active.tabId, active.meetingUrl);
              await stop();
            }
            break;
          case PanelAction.Refresh:
            await refresh(parsed.data.windowId);
            break;
          case PanelAction.Screens:
            if (sender.tab && active && sender.tab.id !== active.tabId) break;
            state.screens = parsed.data.screens === true;
            if (active)
              await chrome.tabs.sendMessage(active.tabId, {
                kind: ContentAction.Start,
                generation: active.generation,
                screens: state.screens,
                visualTargets: recordingSupported,
              });
            break;
          case PanelAction.State:
            break;
        }
      } catch (error) {
        await fail(error);
      }
      broadcast();
      respond(stateForTab(sender.tab?.id));
    })();
    return true;
  }
  if (
    !active ||
    sender.frameId !== 0 ||
    sender.tab?.id !== active.tabId ||
    meetingUrl(sender.url) !== active.meetingUrl
  )
    return false;
  const parsed = contentSchema.safeParse(message);
  if (!parsed.success || parsed.data.generation !== active.generation)
    return false;
  if (parsed.data.kind === ContentAction.Ended) void stop();
  else if (parsed.data.kind === ContentAction.Phase) {
    state.phase = parsed.data.phase;
    if (state.phase !== MeetingPhase.InMeeting) {
      state.cues = [];
      state.coverage = null;
      pendingSnapshot = {
        kind: ContentAction.Snapshot,
        generation: active.generation,
        meeting_url: active.meetingUrl,
        context: {
          title: state.title,
          captions: CaptureAvailability.Unavailable,
          chat: CaptureAvailability.Unavailable,
          participants: [],
          events: [],
          presentation: null,
        },
      };
      void pump();
    }
    broadcast();
  } else if (
    state.phase === MeetingPhase.InMeeting &&
    meetingUrl(parsed.data.meeting_url) === active.meetingUrl
  ) {
    pendingSnapshot = parsed.data;
    void pump();
  }
  return false;
});
chrome.runtime.onConnect.addListener((port) => {
  if (
    port.name !== "cue-panel" ||
    port.sender?.url !== chrome.runtime.getURL("panel.html")
  )
    return;
  panels.add(port);
  port.postMessage(stateForTab(port.sender?.tab?.id));
  if (!heartbeat)
    heartbeat = setInterval(() => {
      if (!active && !connecting) void ping().catch(() => undefined);
    }, 5000);
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (!panels.size && heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (!panels.size && !active && !connecting) {
      client?.close();
      client = null;
    }
  });
});
chrome.tabs.onRemoved.addListener((tabId) => {
  offers.delete(tabId);
  dismissed.delete(tabId);
  if (active?.tabId === tabId) void stop();
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (
    active?.tabId === tabId &&
    (change.status === "loading" ||
      (change.url && meetingUrl(change.url) !== active.meetingUrl))
  )
    void stop();
});
chrome.action.onClicked.addListener((tab) => {
  if (tab.id === undefined || !meetingUrl(tab.url)) return;
  const id = tab.id;
  void chrome.tabs
    .sendMessage(id, { kind: ContentAction.OpenPanel })
    .catch(async () => {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: id, frameIds: [0] },
          files: ["content.js"],
        });
        await chrome.tabs.sendMessage(id, { kind: ContentAction.OpenPanel });
      } catch {
        console.warn("cue_panel_open_failed");
      }
    });
});

void initializeDebug().catch(() => undefined);
