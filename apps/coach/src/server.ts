import path from "node:path";
import { parseArgs } from "node:util";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { type AppBridge, appBridgeFromEnv, type CoachEdit, type MeetingProject } from "./app-bridge";
import { createAccess, loginUrl, randomToken, TOKEN_ENV, withAccess } from "./access";
import { COACH_ARGS, coachOptionsFromArgs } from "./args";
import {
  type ChatStore,
  dropResume,
  keepWrapUp,
  loadChats,
  type OpenReason,
  planChat,
  remember,
  saveChats,
  type SettledWrapUp,
  wrappedTranscripts,
} from "./chat-store";
import { CATCH_UP_WINDOW_MS, catchUpPrompt } from "./checkin";
import { claudeSignedIn } from "./claude-account";
import { claudeCodeFromArgs } from "./claude-code";
import { coachError, GAVE_UP, StderrTail, withSignIn } from "./errors";
import { imageHeaders, resolveImageFile } from "./files";
import { createInterrupter, type Interrupter } from "./interrupt";
import { type MeetingNow, type MeetingSeen, meetingUpdate, userTurn } from "./meeting-context";
import {
  isAnswering,
  type MeetingPointer,
  meetingChange,
  meetingPointer,
  stripView,
  type WrapUpActions,
  wrapUpActions,
} from "./meeting-state";
import { moveText } from "./move";
import { nudgeLabel, nudgeNote, rememberNote, runNudge, withNudgeNotes } from "./nudge";
import { NO_SPEND, spendOf } from "./pricing";
import { type NudgeRequest, PROACTIVE_DEFAULTS, Proactive, type ProactiveView } from "./proactive";
import { actionItemText, blockItemCount } from "./blocks";
import { type AskImage, parseAskImages } from "./images";
import {
  addedBlockItem,
  appendHistory,
  type BlockItemRef,
  type CoachEvent,
  dropSilentNudge,
  findBlock,
  type ProjectView,
  type SetupView,
  type StatusEvent,
  type TurnKind,
  type WrapUpView,
} from "./protocol";
import { QuestionBroker } from "./questions";
import { type CoachSession, readRoots, startCoach } from "./session";
import { signInCommand } from "./sign-in";
import { Supervisor } from "./supervisor";
import { talkStats } from "./talk-time";
import {
  type LiveTranscript,
  readLiveTranscript,
  readMeetingInfo,
  readMeetingStatus,
  readSelfName,
} from "./transcript";
import { runTriage } from "./triage";
import { TurnTracker } from "./turn-events";
import page from "./ui/index.html";
import { commitmentText, generateWrapUp, logToClientsPrompt, type WrapUp } from "./wrapup";

const { values } = parseArgs({
  options: {
    ...COACH_ARGS,
    port: { type: "string", default: "4747" },
    "no-nudges": { type: "boolean", default: false },
    "no-project": { type: "boolean", default: false },
    "nudge-limit": { type: "string", default: String(PROACTIVE_DEFAULTS.capUsd) },
    state: { type: "string" },
    "exit-with-stdin": { type: "boolean", default: false },
  },
});

const nudgeLimit = Number(values["nudge-limit"]);
if (!Number.isFinite(nudgeLimit) || nudgeLimit <= 0) {
  throw new Error(`--nudge-limit must be a dollar amount above 0, got ${values["nudge-limit"]}`);
}
const proactiveConfig = {
  ...PROACTIVE_DEFAULTS,
  enabled: !values["no-nudges"],
  capUsd: nudgeLimit,
};
const TRIAGE_TIMEOUT_MS = 30_000;
const NUDGE_TIMEOUT_MS = 45_000;
const CONTEXT_PEOPLE_MAX = 8;
const options = await coachOptionsFromArgs(values);
const bridge = appBridgeFromEnv(process.env);
const model = values.model ?? "sonnet";
const { db } = options;
const stateFile = values.state ?? path.join(path.dirname(values.db), "coach-chats.json");

const noProject = values["no-project"];

const defaultProject: ProjectView = {
  path: options.project,
  source: "default",
  series: null,
  defaultProject: options.project,
  needsFolder: noProject,
};

const clients = new Set<ReadableStreamDefaultController<string>>();

let coach: CoachSession | null = null;
let tracker = new TurnTracker();
let interrupter: Interrupter | null = null;
const stderr = new StderrTail();
let chatSessionId: string | undefined;
let seen: MeetingSeen | undefined;
let project = defaultProject;
let attached: MeetingPointer | null = null;
let recording: ReadonlySet<string> | undefined;
let recordingUnknown = false;
let wrapUp: WrapUpView | null = null;
let wrapUpMeeting: { sessionId: string; transcriptId: string } | undefined;
let wrapUpAbort: AbortController | null = null;
const editSessions = new Map<string, string>();
const addingBlockItems = new Set<string>();

let store: ChatStore = loadChats(stateFile);
const wrapped = wrappedTranscripts(store);
let history: CoachEvent[] = [];
let persistTimer: ReturnType<typeof setTimeout> | null = null;

let busy = false;
let askedAt = 0;
let lastTranscript = "";
let nudgeAbort: AbortController | null = null;
let nudgeNotes: string[] = [];
let proactive: Proactive | null = null;
let proactiveMeeting: string | undefined;
let selfName: string | null = null;
let claudeSignedInNow: boolean | null = null;
let setup: SetupView = { state: "checking" };
let claudeExecutable: Promise<string> | null = null;

const { claudeCode, executable: claudeCodeExecutable } = claudeCodeFromArgs(values);
claudeCode.onProgress(({ receivedBytes, totalBytes }) => {
  const percent = totalBytes > 0 ? Math.min(99, Math.floor((receivedBytes / totalBytes) * 100)) : null;
  if (setup.state !== "downloading" || setup.percent !== percent) setSetup({ state: "downloading", percent });
});

function setSetup(next: SetupView) {
  setup = next;
  broadcast(status());
}

function claude(): Promise<string> {
  claudeExecutable ??= claudeCodeExecutable().then(
    (resolved) => {
      console.error(`[coach] running Claude Code at ${resolved}`);
      setSetup({ state: "ready" });
      return resolved;
    },
    (error: unknown) => {
      console.error("[coach] could not set up Claude Code", { _e: errorText(error) });
      setSetup({ state: "failed", message: errorText(error) });
      throw error;
    },
  );
  return claudeExecutable;
}

function retrySetup() {
  claudeExecutable = null;
  setSetup({ state: "checking" });
  checkSignIn();
  enqueue(() => openChat("startup"));
}

function checkSignIn() {
  claude().then(
    (resolved) =>
      claudeSignedIn(resolved).then(
        (signedIn) => {
          claudeSignedInNow = signedIn;
        },
        (error: unknown) => console.error("[coach] could not read the Claude sign-in", { _e: errorText(error) }),
      ),
    () => undefined,
  );
}
checkSignIn();

const questions = new QuestionBroker({
  opened: (id, asked) => feed({ type: "question", id, questions: asked }),
  closed: (id, answers) => feed({ type: "question_closed", id, answered: answers !== null }),
});

if (values["exit-with-stdin"]) {
  process.stdin.on("close", () => {
    wrapUpAbort?.abort();
    persistNow();
    coach?.close();
    process.exit(0);
  });
  process.stdin.resume();
}

const RECONNECT_MS = 500;

function frame(event: CoachEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function broadcast(event: CoachEvent) {
  const chunk = frame(event);
  for (const client of clients) client.enqueue(chunk);
}

function feed(next: CoachEvent) {
  const event = next.type === "error" ? { ...next, error: withSignIn(next.error, claudeSignedInNow) } : next;
  if (event.type === "error" && event.error.kind === "auth") checkSignIn();
  history = appendHistory(history, event);
  broadcast(event);
  schedulePersist();
}

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  if (!chatSessionId) return;
  const before = store;
  store = remember(store, chatSessionId, {
    claudeSessionId: tracker.resumable,
    project: project.path,
    history,
    updatedAt: Date.now(),
    seen,
  });
  if (store !== before) saveStore();
}

function saveStore() {
  try {
    saveChats(stateFile, store);
  } catch (error) {
    console.error("[coach] could not save the chat", { _e: errorText(error), stateFile });
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 500);
}

function notice(text: string) {
  feed({ type: "notice", text });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function status(): StatusEvent {
  return {
    type: "status",
    project,
    model,
    busy,
    appConnected: bridge !== null,
    meeting: chatSessionId !== undefined,
    proactive: proactiveView(),
    setup,
  };
}

function proactiveView(): ProactiveView {
  return (
    proactive?.view() ?? {
      state: proactiveConfig.enabled ? "on" : "off",
      nudgesUsd: 0,
      capUsd: proactiveConfig.capUsd,
      meetingUsd: 0,
      meetingTokens: 0,
      cachedTokens: 0,
    }
  );
}

function meetingBasics(sessionId: string): { title: string; people: string[] } {
  const info = readMeetingInfo(db, sessionId);
  const people = (info?.participants ?? [])
    .map((participant) => participant.name || participant.email)
    .filter((name): name is string => Boolean(name) && name !== selfName)
    .slice(0, CONTEXT_PEOPLE_MAX);
  return { title: info?.title || "Untitled", people };
}

function meetingContext(sessionId: string): string {
  const { title, people } = meetingBasics(sessionId);
  return `${title}${people.length > 0 ? ` · with ${people.join(", ")}` : ""}`;
}

function meetingNow(): MeetingNow | null {
  if (!chatSessionId) return null;
  const chat = readMeetingStatus(db, { sessionId: chatSessionId, recording });
  const latest = readMeetingStatus(db, { recording });
  return {
    id: chatSessionId,
    ...meetingBasics(chatSessionId),
    live: chat?.live ?? false,
    startedAtMs: chat?.startedAtMs ?? null,
    endedAtMs: chat?.endedAtMs ?? null,
    elsewhere:
      latest?.live && latest.sessionId !== chatSessionId
        ? { id: latest.sessionId, title: latest.title || "Untitled" }
        : null,
  };
}

function startProactive(sessionId: string | undefined) {
  selfName = sessionId ? readSelfName(db, sessionId) : null;
  if (proactive && proactiveMeeting === sessionId) return;
  proactiveMeeting = sessionId;
  const current = new Proactive(proactiveConfig, {
    triage: async (request) =>
      runTriage(request, {
        signal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
        claudePath: await claude(),
      }),
    nudge: (request) => {
      if (!coach || busy || proactive !== current) return false;
      void runLightNudge(current, request);
      return true;
    },
    busy: () => busy,
    context: () => (sessionId ? meetingContext(sessionId) : "Untitled"),
    changed: () => broadcast(status()),
  });
  proactive = current;
}

async function runLightNudge(owner: Proactive, request: NudgeRequest) {
  const sessionId = proactiveMeeting;
  const abort = new AbortController();
  nudgeAbort = abort;
  const label = `${nudgeLabel(request.hits)} · ${clockTime()}`;
  busy = true;
  askedAt = Date.now();
  feed({ type: "user", kind: "nudge", text: label });
  broadcast(status());
  const result = await claude()
    .then((claudePath) =>
      runNudge(request, {
        instructions: options.instructions ?? "",
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(NUDGE_TIMEOUT_MS)]),
        claudePath,
      }),
    )
    .catch((error: unknown) => ({ ok: false as const, error: errorText(error), spend: NO_SPEND }));
  owner.spend("nudges", result.spend);
  if (nudgeAbort !== abort) return;
  nudgeAbort = null;
  const interrupted = abort.signal.aborted;
  if (!result.ok) {
    if (!interrupted) {
      console.error("[coach] nudge failed", { _e: result.error });
      feed({ type: "error", error: coachError({ message: result.error }) });
    }
    settleTurn({ ok: false, interrupted });
    return;
  }
  if (result.move) {
    feed({ type: "block", id: crypto.randomUUID(), block: { kind: "move", ...result.move } });
    if (bridge && sessionId) {
      bridge.nudged(sessionId, { tag: result.move.tag, line: result.move.line }).catch((error: unknown) => {
        console.error("[coach] could not tell the app about a nudge", { _e: errorText(error), sessionId });
      });
    }
    if (result.talk) feed({ type: "talk", talk: result.talk });
    nudgeNotes = rememberNote(nudgeNotes, nudgeNote(label, moveText(result.move)));
  }
  settleTurn({ ok: true, interrupted: false, silent: result.move === null });
}

function clockTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function projectView(resolved: MeetingProject): ProjectView {
  return {
    path: resolved.project,
    source: resolved.source,
    series: resolved.series?.label ?? null,
    defaultProject: resolved.default_project,
    needsFolder: noProject && resolved.source === "default",
  };
}

async function projectFor(sessionId: string | undefined): Promise<ProjectView> {
  if (!bridge || !sessionId) return defaultProject;
  try {
    return projectView(await bridge.meetingProject(sessionId));
  } catch (error) {
    console.error("[coach] could not resolve the meeting's project", { _e: errorText(error), sessionId });
    notice(`Using the default project: ${errorText(error)}`);
    return defaultProject;
  }
}

let lifecycle: Promise<void> = Promise.resolve();

function enqueue(task: () => Promise<void>) {
  lifecycle = lifecycle.then(task).catch((error: unknown) => {
    console.error("[coach] could not open a chat", { _e: errorText(error) });
    notice(`The coach could not start: ${errorText(error)}`);
  });
}

function settleTurn(input: { ok: boolean; interrupted: boolean; silent?: boolean }) {
  const silent = input.silent ?? false;
  busy = false;
  const done: CoachEvent = {
    type: "done",
    seconds: (Date.now() - askedAt) / 1000,
    ok: input.ok,
    silent,
    interrupted: input.interrupted,
  };
  if (silent) {
    history = dropSilentNudge(history);
    broadcast(done);
  } else {
    feed(done);
  }
  broadcast(status());
  persistNow();
}

const supervisor = new Supervisor<SDKMessage>({
  handle,
  ended: (ours) => {
    coach?.close();
    coach = null;
    if (busy) settleTurn({ ok: false, interrupted: ours });
  },
  failed: (message) => {
    console.error("[coach] the Claude session stopped", { _e: message });
    feed({ type: "error", error: coachError({ message, stderr: stderr.take() }) });
  },
  gaveUp: (message) => {
    console.error("[coach] the Claude session keeps stopping; not restarting it", { _e: message });
    feed({ type: "error", error: { ...coachError({ message, stderr: stderr.take() }), ...GAVE_UP } });
  },
  forget: (id) => {
    console.error("[coach] Claude Code has no conversation to resume; starting a fresh one", { claudeSessionId: id });
    tracker.resumable = null;
    if (!chatSessionId) return;
    store = dropResume(store, chatSessionId);
    saveStore();
  },
  restart: () => enqueue(() => openChat("recover")),
  schedule: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
});

function editHooks(bridge: AppBridge) {
  return {
    bridge,
    onEdit(edit: CoachEdit) {
      editSessions.set(edit.id, edit.session_id);
      feed({ type: "edit", edit });
    },
    onUndo(edit: CoachEdit) {
      feed({ type: "undone", id: edit.id, summary: edit.summary });
    },
  };
}

function rememberEdits(events: readonly CoachEvent[]) {
  for (const event of events) if (event.type === "edit") editSessions.set(event.edit.id, event.edit.session_id);
}

async function openChat(reason: OpenReason) {
  const claudePath = await claude().catch(() => null);
  if (!claudePath) return;
  const sessionId = attached?.sessionId;
  const nextProject = reason === "recover" ? project : await projectFor(sessionId);
  if (reason !== "recover") {
    persistNow();
    supervisor.reset();
  }
  const plan = planChat({
    reason,
    store,
    meeting: attached,
    project: nextProject.path,
    current: { claudeSessionId: tracker.resumable, project: project.path, history, seen },
  });
  coach?.close();
  questions.dismissAll("The chat was closed.");
  store = plan.store;
  project = nextProject;
  chatSessionId = sessionId;
  history = plan.history;
  seen = plan.seen;
  rememberEdits(history);
  tracker = new TurnTracker();
  tracker.resumable = plan.resume;
  const session = startCoach({
    ...options,
    pathToClaudeCodeExecutable: claudePath,
    project: project.path,
    meeting: () => sessionId,
    ...(bridge ? { edits: editHooks(bridge) } : {}),
    ...(plan.resume ? { resume: plan.resume } : {}),
    askUser: (id, asked, signal) => questions.ask(id, asked, signal),
    show: (block) => feed({ type: "block", id: crypto.randomUUID(), block }),
    onToolResult: (id, response, name) => tracker.hookResult(id, response, name),
    stderr: (chunk) => stderr.push(chunk),
  });
  coach = session;
  interrupter = createInterrupter({
    interrupt: () => session.interrupt(),
    abort: () => {
      supervisor.aborting();
      session.abort();
    },
  });
  busy = false;
  nudgeAbort?.abort();
  nudgeAbort = null;
  if (reason !== "recover") nudgeNotes = [];
  startProactive(sessionId);
  if (plan.resume && reason !== "recover" && history.length > 0) {
    history = appendHistory(history, { type: "divider", text: "Picked up where you left off" });
  }
  if (!wrapUp && plan.wrapUp && sessionId) {
    const { view, transcriptId } = plan.wrapUp;
    wrapUp = view.state === "ready" ? { ...view, actions: actionsFor(view.wrapUp) } : view;
    wrapUpMeeting = { sessionId, transcriptId };
  }
  if (reason !== "startup") broadcast({ type: "reset", reason: reason === "recover" ? "sync" : reason });
  for (const event of history) broadcast(event);
  if (reason !== "startup" && wrapUp) broadcast({ type: "wrapup", wrapUp });
  broadcast(status());
  supervisor.watch(session, plan.resume);
}

function startTurn(session: CoachSession, kind: TurnKind, label: string, prompt: string, images: AskImage[] = []) {
  busy = true;
  askedAt = Date.now();
  tracker.beginTurn();
  const update = meetingUpdate(seen, meetingNow(), askedAt);
  seen = update.seen;
  const turn = userTurn({ kind, label, prompt: withNudgeNotes(nudgeNotes, prompt), line: update.line, images });
  feed(turn.event);
  broadcast(status());
  session.ask(turn.content);
  nudgeNotes = [];
}

function runCatchUp(session: CoachSession, lines: LiveTranscript["lines"]) {
  proactive?.caughtUp();
  const since = Math.max(0, (lines.at(-1)?.end_ms ?? 0) - CATCH_UP_WINDOW_MS);
  startTurn(session, "catchup", `Catch me up · ${clockTime()}`, catchUpPrompt(since));
  const talk = talkStats(lines, CATCH_UP_WINDOW_MS);
  if (talk) feed({ type: "talk", talk });
}

function readTranscript() {
  return readLiveTranscript(db, { sessionId: values.session, recording });
}

async function refreshRecording() {
  if (!bridge) return;
  try {
    recording = await bridge.recordingSessions();
    recordingUnknown = false;
  } catch (error) {
    recording = undefined;
    if (!recordingUnknown) console.error("[coach] could not ask the app what it is recording", { _e: errorText(error) });
    recordingUnknown = true;
  }
}

function transcriptEvent(transcript = readTranscript()): CoachEvent {
  const strip = stripView(transcript);
  return {
    type: "transcript",
    strip,
    lines:
      strip.state === "live" && transcript
        ? transcript.lines
            .slice(-6)
            .map((line) => ({ speaker: line.speaker, you: line.channel === 0, text: line.text.trim() }))
        : [],
    pending: strip.state === "live" && transcript ? transcript.pending.trim() : "",
  };
}

function setWrapUp(next: WrapUpView | null) {
  wrapUp = next;
  broadcast({ type: "wrapup", wrapUp });
  if (wrapUpMeeting && next && next.state !== "running") storeWrapUp(wrapUpMeeting, next);
}

function storeWrapUp(meeting: { sessionId: string; transcriptId: string }, view: SettledWrapUp) {
  store = keepWrapUp(store, meeting.sessionId, { transcriptId: meeting.transcriptId, view, updatedAt: Date.now() });
  saveStore();
}

function actionsFor(result: WrapUp): WrapUpActions {
  return wrapUpActions({
    appConnected: bridge !== null,
    mcpServers: Object.keys(options.mcpServers ?? {}),
    allowChanges: options.allowChanges ?? [],
    commitments: result.commitments.length,
  });
}

function startWrapUp(transcript: LiveTranscript) {
  if (transcript.lines.length === 0) return;
  wrapUpAbort?.abort();
  const abort = new AbortController();
  wrapUpAbort = abort;
  wrapUpMeeting = { sessionId: transcript.sessionId, transcriptId: transcript.transcriptId };
  const title = transcript.title;
  setWrapUp({ state: "running", title });
  claude()
    .then((claudePath) =>
      generateWrapUp(transcript, readMeetingInfo(db, transcript.sessionId), {
        model,
        claudePath,
        signal: abort.signal,
      }),
    )
    .then((result) => {
      if (wrapUpAbort !== abort) return;
      setWrapUp({
        state: "ready",
        title,
        wrapUp: result,
        commitments: result.commitments.map(commitmentText),
        actions: actionsFor(result),
        added: false,
        logged: false,
        talk: talkStats(transcript.lines, Number.POSITIVE_INFINITY),
      });
    })
    .catch((error: unknown) => {
      if (wrapUpAbort !== abort) return;
      console.error("[coach] wrap-up failed", { _e: errorText(error) });
      setWrapUp({ state: "failed", title, message: errorText(error) });
    });
}

function cancelWrapUp() {
  wrapUpAbort?.abort();
  wrapUpAbort = null;
  wrapUpMeeting = undefined;
  if (wrapUp) setWrapUp(null);
}

await refreshRecording();
attached = meetingPointer(readTranscript());
enqueue(() => openChat("startup"));

let polling = false;
setInterval(() => {
  if (polling) return;
  polling = true;
  void poll().finally(() => {
    polling = false;
  });
}, 1_000);

async function poll() {
  await refreshRecording();
  const transcript = readTranscript();
  const event = transcriptEvent(transcript);
  const serialized = JSON.stringify(event);
  if (serialized !== lastTranscript) {
    lastTranscript = serialized;
    broadcast(event);
  }

  const next = meetingPointer(transcript);
  const change = meetingChange(attached, next, wrapped);
  if (next) attached = next;
  if (change.newChat) {
    cancelWrapUp();
    enqueue(() => openChat("meeting"));
    return;
  }
  if (change.wrapUp && transcript) {
    wrapped.add(transcript.transcriptId);
    startWrapUp(transcript);
  }

  if (!transcript || !coach || transcript.sessionId !== chatSessionId) return;
  proactive?.observe({ lines: transcript.lines, pending: transcript.pending, live: transcript.live, selfName });
}

function handle(message: SDKMessage) {
  if (message.type === "result") {
    const interrupted = interrupter?.pending ?? false;
    interrupter?.settled();
    const outcome = tracker.finishTurn(message, { interrupted, stderr: stderr.take() });
    if (outcome.ok) supervisor.reset();
    if (outcome.sources.length > 0) feed({ type: "sources", sources: outcome.sources });
    if (outcome.usage) {
      feed({ type: "usage", usage: outcome.usage });
      proactive?.spend("asks", spendOf(outcome.usage.model ?? model, outcome.usage));
    }
    if (outcome.error) feed({ type: "error", error: outcome.error });
    settleTurn({ ok: outcome.ok, interrupted });
    return;
  }
  for (const event of tracker.handle(message)) feed(event);
}

function conflict(text: string) {
  return new Response(text, { status: 409 });
}

async function bridgeCall(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error("[coach] the app refused a change", { _e: errorText(error) });
    return conflict(errorText(error));
  }
}

async function changeSeriesProject(change: (bridge: AppBridge, sessionId: string) => Promise<MeetingProject | null>) {
  if (!bridge || !chatSessionId) return conflict("Open the coach from the app during a meeting first.");
  const sessionId = chatSessionId;
  return bridgeCall(async () => {
    const resolved = await change(bridge, sessionId);
    if (resolved && resolved.project !== project.path) enqueue(() => openChat("project"));
    else if (resolved) {
      project = projectView(resolved);
      broadcast(status());
    }
    return new Response(null, { status: 204 });
  });
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? Object.fromEntries(Object.entries(body)) : {};
  } catch {
    return {};
  }
}

function projectImage(requested: string) {
  return resolveImageFile(requested, project.path, readRoots({ ...options, project: project.path }));
}

function blockItemRef(body: Record<string, unknown>): BlockItemRef | null {
  const id = typeof body.block_id === "string" ? body.block_id : "";
  const index = typeof body.index === "number" && Number.isInteger(body.index) ? body.index : -1;
  const block = id ? findBlock(history, id) : null;
  if (!block || index < 0) return null;
  return index < blockItemCount(block) ? { id, index } : null;
}

const port = Number(values.port);
const launchToken = process.env[TOKEN_ENV];
delete process.env[TOKEN_ENV];
const access = createAccess(launchToken || randomToken(), port);

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  idleTimeout: 0,
  routes: withAccess(access, page, {
    "/events": () => {
      let controller: ReadableStreamDefaultController<string>;
      const stream = new ReadableStream<string>({
        start(next) {
          controller = next;
          clients.add(controller);
          controller.enqueue(`retry: ${RECONNECT_MS}\n\n`);
          controller.enqueue(frame(status()));
          controller.enqueue(frame(transcriptEvent()));
          controller.enqueue(frame({ type: "reset", reason: "sync" }));
          for (const event of history) controller.enqueue(frame(event));
          if (wrapUp) controller.enqueue(frame({ type: "wrapup", wrapUp }));
        },
        cancel() {
          clients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
      });
    },
    "/busy": () => Response.json({ busy: isAnswering(busy, wrapUp) }),
    "/ask": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const images = parseAskImages(body.images);
        if (!images.ok) return new Response(images.error, { status: 400 });
        if (!text && images.images.length === 0) return new Response("Type a question first.", { status: 400 });
        if (!coach) return new Response("The coach is starting. Try again in a moment.", { status: 503 });
        if (busy) return conflict("The coach is still answering. Stop it first, or wait a moment.");
        startTurn(coach, "ask", text, text, images.images);
        return new Response(null, { status: 204 });
      },
    },
    "/blocks/check": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const ref = blockItemRef(body);
        if (!ref || typeof body.checked !== "boolean") return new Response("That item no longer exists.", { status: 404 });
        feed({ type: "block_check", id: ref.id, index: ref.index, checked: body.checked });
        return new Response(null, { status: 204 });
      },
    },
    "/blocks/action-item": {
      POST: async (request) => {
        const ref = blockItemRef(await jsonBody(request));
        const block = ref && findBlock(history, ref.id);
        const item = ref && block?.kind === "actions" ? block.items[ref.index] : undefined;
        if (!ref || !item) return new Response("That item no longer exists.", { status: 404 });
        const key = `${ref.id}:${ref.index}`;
        if (addingBlockItems.has(key) || addedBlockItem(history, ref)) return conflict("That item is already in the notes.");
        if (!bridge || !chatSessionId) return conflict("Open the coach from the app during a meeting to add to the notes.");
        const sessionId = chatSessionId;
        addingBlockItems.add(key);
        return bridgeCall(async () => {
          try {
            const edit = await bridge.addActionItem(sessionId, actionItemText(item));
            editSessions.set(edit.id, edit.session_id);
            feed({ type: "edit", edit, block: ref });
            return new Response(null, { status: 204 });
          } finally {
            addingBlockItems.delete(key);
          }
        });
      },
    },
    "/checkin": {
      POST: () => {
        if (busy) return conflict("The coach is answering. Check in again when it's done.");
        if (!coach) return new Response("The coach is starting. Try again in a moment.", { status: 503 });
        const transcript = readTranscript();
        if (!transcript?.live || transcript.sessionId !== chatSessionId) {
          return new Response("Check-ins need a meeting that's recording.", { status: 404 });
        }
        runCatchUp(coach, transcript.lines);
        return new Response(null, { status: 204 });
      },
    },
    "/stop": {
      POST: () => {
        if (nudgeAbort) nudgeAbort.abort();
        else if (busy) interrupter?.request();
        return new Response(null, { status: 204 });
      },
    },
    "/question": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const id = typeof body.id === "string" ? body.id : "";
        const answers = Array.isArray(body.answers) ? body.answers.filter((answer) => typeof answer === "string") : null;
        const settled = answers ? questions.answer(id, answers) : questions.dismiss(id);
        return settled ? new Response(null, { status: 204 }) : new Response("That question is closed.", { status: 404 });
      },
    },
    "/open": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const url = typeof body.url === "string" ? body.url : "";
        if (!/^https?:\/\//i.test(url)) return new Response("Only web links can be opened.", { status: 400 });
        Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
        return new Response(null, { status: 204 });
      },
    },
    "/file": {
      GET: (request) => {
        const image = projectImage(new URL(request.url).searchParams.get("path") ?? "");
        if (!image.ok) return new Response(image.reason, { status: image.status });
        return new Response(Bun.file(image.file), { headers: imageHeaders(image.type) });
      },
    },
    "/open-image": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const image = projectImage(typeof body.path === "string" ? body.path : "");
        if (!image.ok) return new Response(image.reason, { status: image.status });
        Bun.spawn(["open", "--", image.file], { stdout: "ignore", stderr: "ignore" });
        return new Response(null, { status: 204 });
      },
    },
    "/sign-in": {
      POST: async () => {
        const claudePath = await claude().catch(() => null);
        if (!claudePath) return new Response("The coach is still setting up. Sign in once it's ready.", { status: 503 });
        Bun.spawn(signInCommand(claudePath), { stdout: "ignore", stderr: "ignore" });
        return new Response(null, { status: 204 });
      },
    },
    "/setup/retry": {
      POST: () => {
        if (setup.state !== "failed") return conflict("There's nothing to retry.");
        retrySetup();
        return new Response(null, { status: 204 });
      },
    },
    "/new-chat": {
      POST: () => {
        enqueue(() => openChat("manual"));
        return new Response(null, { status: 204 });
      },
    },
    "/project": {
      POST: () => {
        if (!bridge) return conflict("Open the coach from the app to choose a folder.");
        const app = bridge;
        return bridgeCall(async () => {
          await app.chooseDefaultProject();
          return new Response(null, { status: 204 });
        });
      },
    },
    "/project/series": {
      POST: () => changeSeriesProject((bridge, sessionId) => bridge.chooseSeriesProject(sessionId)),
      DELETE: () => changeSeriesProject((bridge, sessionId) => bridge.clearSeriesProject(sessionId)),
    },
    "/undo": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const editId = typeof body.edit_id === "string" ? body.edit_id : "";
        const sessionId = editSessions.get(editId);
        if (!bridge || !sessionId) return new Response("That edit can no longer be undone here.", { status: 404 });
        return bridgeCall(async () => {
          const edit = await bridge.undo(sessionId, editId);
          feed({ type: "undone", id: edit.id, summary: edit.summary });
          return new Response(null, { status: 204 });
        });
      },
    },
    "/wrapup/action-items": {
      POST: () => {
        if (wrapUp?.state !== "ready" || !wrapUp.actions.addActionItems.enabled || wrapUp.added) {
          return conflict("There's nothing to add.");
        }
        if (!bridge || !wrapUpMeeting) return conflict("Open the coach from the app to add action items.");
        const ready = wrapUp;
        const meeting = wrapUpMeeting;
        const hooks = editHooks(bridge);
        let added = 0;
        return bridgeCall(async () => {
          try {
            for (const commitment of ready.commitments) {
              hooks.onEdit(await bridge.addActionItem(meeting.sessionId, commitment));
              added += 1;
            }
          } finally {
            if (added > 0 && wrapUpMeeting === meeting) setWrapUp({ ...ready, added: true });
            else if (added > 0) storeWrapUp(meeting, { ...ready, added: true });
          }
          return new Response(null, { status: 204 });
        });
      },
    },
    "/wrapup/log-clients": {
      POST: () => {
        if (wrapUp?.state !== "ready" || !wrapUp.actions.logToClients.enabled || wrapUp.logged) {
          return conflict("There's nothing to log.");
        }
        if (busy) return conflict("The coach is answering. Try again when it's done.");
        if (!coach) return new Response("The coach is starting. Try again in a moment.", { status: 503 });
        startTurn(coach, "ask", "Log promises to clients", logToClientsPrompt(wrapUp.title, wrapUp.wrapUp));
        setWrapUp({ ...wrapUp, logged: true });
        return new Response(null, { status: 204 });
      },
    },
  }),
});

console.error(`[coach] http://${server.hostname}:${server.port} · project ${options.project}`);
if (!launchToken) console.error(`[coach] no ${TOKEN_ENV} set; sign in once at ${loginUrl(access)}`);
