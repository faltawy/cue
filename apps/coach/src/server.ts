import path from "node:path";
import { parseArgs } from "node:util";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { type AppBridge, appBridgeFromEnv, type CoachEdit, type MeetingProject } from "./app-bridge";
import { COACH_ARGS, coachOptionsFromArgs } from "./args";
import { type ChatStore, loadChats, type OpenReason, planChat, remember, saveChats } from "./chat-store";
import { CATCH_UP_WINDOW_MS, catchUpPrompt, isNothing } from "./checkin";
import { coachError, StderrTail } from "./errors";
import { createInterrupter, type Interrupter } from "./interrupt";
import { type MeetingPointer, meetingChange, stripView, type WrapUpActions, wrapUpActions } from "./meeting-state";
import { nudgeLabel, nudgeNote, rememberNote, runNudge, withNudgeNotes } from "./nudge";
import { NO_SPEND, spendOf } from "./pricing";
import { type NudgeRequest, PROACTIVE_DEFAULTS, Proactive, type ProactiveView } from "./proactive";
import { actionItemText } from "./blocks";
import {
  addedBlockItem,
  appendHistory,
  type BlockItemRef,
  type CoachEvent,
  dropSilentNudge,
  findBlock,
  type ProjectView,
  type StatusEvent,
  type TurnKind,
  type WrapUpView,
} from "./protocol";
import { QuestionBroker } from "./questions";
import { type CoachSession, startCoach } from "./session";
import { signInCommand } from "./sign-in";
import { type LiveTranscript, readLiveTranscript, readMeetingInfo, readSelfName } from "./transcript";
import { runTriage } from "./triage";
import { TurnTracker } from "./turn-events";
import page from "./ui/index.html";
import { commitmentText, generateWrapUp, logToClientsPrompt, type WrapUp } from "./wrapup";

const { values } = parseArgs({
  options: {
    ...COACH_ARGS,
    port: { type: "string", default: "4747" },
    "no-nudges": { type: "boolean", default: false },
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

const defaultProject: ProjectView = {
  path: options.project,
  source: "default",
  series: null,
  defaultProject: options.project,
};

const clients = new Set<ReadableStreamDefaultController<string>>();

let coach: CoachSession | null = null;
let tracker = new TurnTracker();
let interrupter: Interrupter | null = null;
const stderr = new StderrTail();
let generation = 0;
let chatSessionId: string | undefined;
let project = defaultProject;
let attached: MeetingPointer | null = null;
const wrapped = new Set<string>();
let wrapUp: WrapUpView | null = null;
let wrapUpSessionId: string | undefined;
let wrapUpAbort: AbortController | null = null;
const editSessions = new Map<string, string>();
const addingBlockItems = new Set<string>();

let store: ChatStore = loadChats(stateFile);
let history: CoachEvent[] = [];
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let recoveries = 0;

let busy = false;
let askedAt = 0;
let lastTranscript = "";
let nudgeAbort: AbortController | null = null;
let nudgeNotes: string[] = [];
let proactive: Proactive | null = null;
let proactiveMeeting: string | undefined;
let selfName: string | null = null;

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

function feed(event: CoachEvent) {
  history = appendHistory(history, event);
  broadcast(event);
  schedulePersist();
}

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const claudeSessionId = tracker.sessionId;
  if (!chatSessionId || !claudeSessionId) return;
  store = remember(store, chatSessionId, { claudeSessionId, project: project.path, history, updatedAt: Date.now() });
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

function meetingContext(sessionId: string): string {
  const info = readMeetingInfo(db, sessionId);
  const people = (info?.participants ?? [])
    .map((participant) => participant.name || participant.email)
    .filter((name): name is string => Boolean(name) && name !== selfName)
    .slice(0, CONTEXT_PEOPLE_MAX);
  return `${info?.title || "Untitled"}${people.length > 0 ? ` · with ${people.join(", ")}` : ""}`;
}

function startProactive(sessionId: string | undefined) {
  selfName = sessionId ? readSelfName(db, sessionId) : null;
  if (proactive && proactiveMeeting === sessionId) return;
  proactiveMeeting = sessionId;
  const current = new Proactive(proactiveConfig, {
    triage: (request) =>
      runTriage(request, {
        signal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
        claudePath: options.pathToClaudeCodeExecutable,
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
  const abort = new AbortController();
  nudgeAbort = abort;
  const label = `${nudgeLabel(request.hits)} · ${clockTime()}`;
  busy = true;
  askedAt = Date.now();
  feed({ type: "user", kind: "nudge", text: label });
  broadcast(status());
  const result = await runNudge(request, {
    instructions: options.instructions ?? "",
    signal: AbortSignal.any([abort.signal, AbortSignal.timeout(NUDGE_TIMEOUT_MS)]),
    claudePath: options.pathToClaudeCodeExecutable,
  }).catch((error: unknown) => ({ ok: false as const, error: errorText(error), spend: NO_SPEND }));
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
  const silent = isNothing(result.text) || result.text === "";
  if (!silent) {
    feed({ type: "text", delta: result.text });
    nudgeNotes = rememberNote(nudgeNotes, nudgeNote(label, result.text));
  }
  settleTurn({ ok: true, interrupted: false, silent });
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

let aborting = false;

function pump(session: CoachSession, mine: number) {
  void (async () => {
    let failure: unknown = null;
    try {
      for await (const message of session.messages) {
        if (mine !== generation) return;
        handle(message);
      }
    } catch (error) {
      failure = error;
    }
    if (mine !== generation) return;
    const ours = aborting;
    aborting = false;
    if (ours) {
      if (busy) settleTurn({ ok: false, interrupted: true });
    } else {
      const message = failure === null ? "Claude Code exited unexpectedly." : errorText(failure);
      console.error("[coach] the Claude session stopped", { _e: message });
      feed({ type: "error", error: coachError({ message, stderr: stderr.take() }) });
      if (busy) settleTurn({ ok: false, interrupted: false });
    }
    if (recoveries < 2) {
      recoveries += 1;
      enqueue(() => openChat("recover"));
    } else {
      notice("The coach stopped. Start a new chat to try again.");
    }
  })();
}

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
  const sessionId = attached?.sessionId;
  const nextProject = reason === "recover" ? project : await projectFor(sessionId);
  if (reason !== "recover") persistNow();
  const plan = planChat({
    reason,
    store,
    meeting: attached,
    project: nextProject.path,
    current: { claudeSessionId: tracker.sessionId, project: project.path, history },
  });
  const mine = ++generation;
  coach?.close();
  questions.dismissAll("The chat was closed.");
  store = plan.store;
  project = nextProject;
  chatSessionId = sessionId;
  history = plan.history;
  rememberEdits(history);
  tracker = new TurnTracker();
  tracker.sessionId = plan.resume;
  const session = startCoach({
    ...options,
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
      aborting = true;
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
  if (reason !== "startup") broadcast({ type: "reset", reason: reason === "recover" ? "sync" : reason });
  if (reason === "recover" || plan.resume) for (const event of history) broadcast(event);
  if (reason !== "startup" && wrapUp) broadcast({ type: "wrapup", wrapUp });
  broadcast(status());
  pump(session, mine);
}

function startTurn(session: CoachSession, kind: TurnKind, label: string, prompt: string) {
  busy = true;
  askedAt = Date.now();
  tracker.beginTurn();
  feed({ type: "user", kind, text: label });
  broadcast(status());
  session.ask(withNudgeNotes(nudgeNotes, prompt));
  nudgeNotes = [];
}

function runCatchUp(session: CoachSession, latestSpeechEndMs: number) {
  proactive?.caughtUp();
  const since = Math.max(0, latestSpeechEndMs - CATCH_UP_WINDOW_MS);
  startTurn(session, "catchup", `Catch me up · ${clockTime()}`, catchUpPrompt(since));
}

function readTranscript() {
  return readLiveTranscript(db, { sessionId: values.session });
}

function pointer(transcript: LiveTranscript | null): MeetingPointer | null {
  return transcript
    ? { sessionId: transcript.sessionId, transcriptId: transcript.transcriptId, live: transcript.live }
    : null;
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
  wrapUpSessionId = transcript.sessionId;
  const title = transcript.title;
  setWrapUp({ state: "running", title });
  generateWrapUp(transcript, readMeetingInfo(db, transcript.sessionId), {
    model,
    claudePath: options.pathToClaudeCodeExecutable,
    signal: abort.signal,
  })
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
  wrapUpSessionId = undefined;
  if (wrapUp) setWrapUp(null);
}

attached = pointer(readTranscript());
enqueue(() => openChat("startup"));

setInterval(() => {
  const transcript = readTranscript();
  const event = transcriptEvent(transcript);
  const serialized = JSON.stringify(event);
  if (serialized !== lastTranscript) {
    lastTranscript = serialized;
    broadcast(event);
  }

  const next = pointer(transcript);
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
}, 1_000);

function handle(message: SDKMessage) {
  if (message.type === "result") {
    const interrupted = interrupter?.pending ?? false;
    interrupter?.settled();
    const outcome = tracker.finishTurn(message, { interrupted, stderr: stderr.take() });
    recoveries = 0;
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

function blockItemRef(body: Record<string, unknown>): BlockItemRef | null {
  const id = typeof body.block_id === "string" ? body.block_id : "";
  const index = typeof body.index === "number" && Number.isInteger(body.index) ? body.index : -1;
  const block = id ? findBlock(history, id) : null;
  if (!block || index < 0) return null;
  const size = block.kind === "actions" ? block.items.length : block.options.length;
  return index < size ? { id, index } : null;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(values.port),
  idleTimeout: 0,
  routes: {
    "/": page,
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
    "/ask": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        if (!text) return new Response("Type a question first.", { status: 400 });
        if (!coach) return new Response("The coach is starting. Try again in a moment.", { status: 503 });
        if (busy) return conflict("The coach is still answering. Stop it first, or wait a moment.");
        startTurn(coach, "ask", text, text);
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
        runCatchUp(coach, transcript.lines.at(-1)?.end_ms ?? 0);
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
    "/sign-in": {
      POST: () => {
        Bun.spawn(signInCommand(options.pathToClaudeCodeExecutable), { stdout: "ignore", stderr: "ignore" });
        return new Response(null, { status: 204 });
      },
    },
    "/new-chat": {
      POST: () => {
        enqueue(() => openChat("manual"));
        return new Response(null, { status: 204 });
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
        if (!bridge || !wrapUpSessionId) return conflict("Open the coach from the app to add action items.");
        const ready = wrapUp;
        const sessionId = wrapUpSessionId;
        const hooks = editHooks(bridge);
        let added = 0;
        return bridgeCall(async () => {
          try {
            for (const commitment of ready.commitments) {
              hooks.onEdit(await bridge.addActionItem(sessionId, commitment));
              added += 1;
            }
          } finally {
            if (added > 0) setWrapUp({ ...ready, added: true });
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
  },
});

console.error(`[coach] http://${server.hostname}:${server.port} · project ${options.project}`);
