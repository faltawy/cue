import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";

import {
  ProjectSource,
  type AppBridge,
  appBridgeFromEnv,
  type CoachEdit,
  type MeetingProject,
} from "@anlg/assistant/app-bridge";
import {
  BlockKind,
  actionItemText,
  blockItemCount,
} from "@anlg/assistant/blocks";
import {
  MeetingIntent,
  DEFAULT_COACHING,
  meetingCoachingSchema,
  meetingIntentSchema,
  intentGuidance,
} from "@anlg/assistant/coaching-preferences";
import {
  CoachErrorKind,
  coachError,
  GAVE_UP,
  StderrTail,
  withSignIn,
} from "@anlg/assistant/errors";
import {
  StripState,
  isAnswering,
  type MeetingPointer,
  meetingChange,
  meetingPointer,
  stripView,
  type WrapUpActions,
  wrapUpActions,
} from "@anlg/assistant/meeting-state";
import {
  evidenceMomentId,
  evidenceTargetSchema,
  FeedbackReason,
  type CoachFeedback,
  type EvidenceTarget,
  type Moment,
  MoveTag,
  moveText,
} from "@anlg/assistant/move";
import { NO_SPEND, spendOf } from "@anlg/assistant/pricing";
import {
  ResetReason,
  WrapUpState,
  CoachEventType,
  SetupState,
  addedBlockItem,
  appendHistory,
  type BlockItemRef,
  type CoachEvent,
  dropSilentNudge,
  findBlock,
  type ProjectView,
  type SetupView,
  type StatusEvent,
  TurnKind,
  type WrapUpView,
} from "@anlg/assistant/protocol";
import { CoachProvider, parseProvider } from "@anlg/assistant/provider";
import { QuestionBroker } from "@anlg/assistant/questions";
import { AssistantScope } from "@anlg/assistant/scope";

import {
  createAccess,
  loginUrl,
  randomToken,
  TOKEN_ENV,
  withAccess,
} from "./access";
import { COACH_ARGS, coachOptionsFromArgs } from "./args";
import {
  ResumeReason,
  type ChatStore,
  dropResume,
  keepWrapUp,
  isHandledMoment,
  loadChats,
  type OpenReason,
  planChat,
  prioritizeHitsByFeedback,
  remember,
  saveFeedback,
  saveChats,
  type SettledWrapUp,
  wrappedTranscripts,
  coachingFor,
  setMeetingCoaching,
  deferCoaching,
} from "./chat-store";
import { CATCH_UP_WINDOW_MS, catchUpPrompt } from "./checkin";
import { claudeAccount } from "./claude-account";
import { claudeCodeFromArgs } from "./claude-code";
import { codexAccount, signInCodex } from "./codex-account";
import { codexCodeFromArgs } from "./codex-code";
import { dictationHandler } from "./dictation";
import { imageHeaders, resolveImageFile } from "./files";
import { type AskImage, parseAskImages } from "./images";
import { createInterrupter, type Interrupter } from "./interrupt";
import {
  type MeetingNow,
  type MeetingSeen,
  meetingUpdate,
  userTurn,
} from "./meeting-context";
import {
  nudgeLabel,
  nudgeNote,
  rememberNote,
  runNudge,
  withNudgeNotes,
} from "./nudge";
import { deliverNudge } from "./nudge-delivery";
import {
  SpendSource,
  NudgePath,
  NudgeDispatch,
  ProactiveState,
  type NudgeRequest,
  PROACTIVE_DEFAULTS,
  Proactive,
  type ProactiveView,
} from "./proactive";
import { RuntimeMessageType, type RuntimeMessage } from "./runtime-message";
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
  type TranscriptLine,
} from "./transcript";
import { runTriage } from "./triage";
import { TurnTracker } from "./turn-events";
import page from "./ui/index.html";
import {
  commitmentText,
  generateWrapUp,
  logToClientsPrompt,
  type WrapUp,
} from "./wrapup";

const { values } = parseArgs({
  options: {
    ...COACH_ARGS,
    port: { type: "string", default: "4747" },
    "no-nudges": { type: "boolean", default: false },
    "no-project": { type: "boolean", default: false },
    "nudge-limit": {
      type: "string",
      default: String(PROACTIVE_DEFAULTS.capUsd),
    },
    state: { type: "string" },
    scope: { type: "string", default: AssistantScope.Meeting },
    "exit-with-stdin": { type: "boolean", default: false },
  },
});

const scope = z.enum(AssistantScope).parse(values.scope);
const library = scope === AssistantScope.Library;
const LIBRARY_CHAT = "cue:library";

const nudgeLimit = Number(values["nudge-limit"]);
if (!Number.isFinite(nudgeLimit) || nudgeLimit <= 0) {
  throw new Error(
    `--nudge-limit must be a dollar amount above 0, got ${values["nudge-limit"]}`,
  );
}
const proactiveConfig = {
  ...PROACTIVE_DEFAULTS,
  enabled: !library && !values["no-nudges"],
  capUsd: nudgeLimit,
};
const TRIAGE_TIMEOUT_MS = 30_000;
const NUDGE_TIMEOUT_MS = 45_000;
const coachFeedbackSchema = z.strictObject({
  category: z.enum(MoveTag),
  useful: z.boolean(),
  reason: z.enum(FeedbackReason).optional(),
  momentId: z.string().min(1).optional(),
});
const CONTEXT_PEOPLE_MAX = 8;
const options = await coachOptionsFromArgs(values);
const bridge = appBridgeFromEnv(process.env, scope);
const selectedProvider = parseProvider(values.provider);
const selected = {
  provider: selectedProvider,
  model: options.model ?? "sonnet",
  models: {
    claude:
      values["claude-model"] ??
      (selectedProvider === CoachProvider.Claude
        ? (options.model ?? "sonnet")
        : "sonnet"),
    codex:
      values["codex-model"] ??
      (selectedProvider === CoachProvider.Codex ? (options.model ?? "") : ""),
  },
};
let provider = selected.provider;
let model = selected.model;
const { db } = options;
const stateFile =
  values.state ??
  path.join(
    path.dirname(values.db),
    library ? "assistant-chats.json" : "coach-chats.json",
  );

const noProject = values["no-project"];

const defaultProject: ProjectView = {
  path: options.project,
  source: ProjectSource.Default,
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
let libraryContext: string | undefined;
let seen: MeetingSeen | undefined;
let project = defaultProject;
let attached: MeetingPointer | null = null;
let recording: ReadonlySet<string> | undefined;
let recordingUnknown = false;
let pausedRecordings = new Set<string>();
let wrapUp: WrapUpView | null = null;
let wrapUpMeeting: { sessionId: string; transcriptId: string } | undefined;
let wrapUpAbort: AbortController | null = null;
const editSessions = new Map<string, string | null>();
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
let signedInNow: boolean | null = null;
let signingIn = false;
let setup: SetupView = { state: SetupState.Checking };
const executables = new Map<CoachProvider, Promise<string>>();
const { claudeCode, executable: claudeCodeExecutable } =
  claudeCodeFromArgs(values);
const {
  codexCode,
  executable: codexCodeExecutable,
  home: codexHome,
} = codexCodeFromArgs(values);
for (const [owner, runtime] of [
  ["claude", claudeCode],
  ["codex", codexCode],
] as const) {
  runtime.onProgress(({ receivedBytes, totalBytes }) => {
    if (owner !== provider) return;
    const percent =
      totalBytes > 0
        ? Math.min(99, Math.floor((receivedBytes / totalBytes) * 100))
        : null;
    if (setup.state !== SetupState.Downloading || setup.percent !== percent)
      setSetup({ state: SetupState.Downloading, percent });
  });
}

function setSetup(next: SetupView) {
  setup = next;
  broadcast(status());
}

function executable(owner: CoachProvider = provider): Promise<string> {
  let pending = executables.get(owner);
  if (!pending) {
    pending = (
      owner === CoachProvider.Codex
        ? codexCodeExecutable()
        : claudeCodeExecutable()
    ).catch((error: unknown) => {
      executables.delete(owner);
      throw error;
    });
    executables.set(owner, pending);
  }
  return pending;
}

function retrySetup() {
  executables.delete(provider);
  setSetup({ state: SetupState.Checking });
  enqueue(() => openChat(ResumeReason.Startup));
}

function checkSignIn() {
  const owner = provider;
  executable(owner).then(
    (resolved) =>
      (owner === CoachProvider.Codex
        ? codexAccount(resolved, codexHome)
        : claudeAccount(resolved)
      ).then(
        (account) => {
          if (owner === provider) signedInNow = account.signedIn;
        },
        (error: unknown) =>
          console.error("[coach] could not read the sign-in", {
            _e: errorText(error),
          }),
      ),
    () => undefined,
  );
}

const questions = new QuestionBroker({
  opened: (id, asked) =>
    feed({ type: CoachEventType.Question, id, questions: asked }),
  closed: (id, answers) =>
    feed({
      type: CoachEventType.QuestionClosed,
      id,
      answered: answers !== null,
    }),
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
  const event =
    next.type === CoachEventType.Error
      ? { ...next, error: withSignIn(next.error, signedInNow, provider) }
      : next;
  if (
    event.type === CoachEventType.Error &&
    event.error.kind === CoachErrorKind.Auth
  )
    checkSignIn();
  history = appendHistory(history, event);
  broadcast(event);
  schedulePersist();
}

function persistNow() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  const conversationId = library ? LIBRARY_CHAT : chatSessionId;
  if (!conversationId) return;
  const before = store;
  store = remember(store, conversationId, {
    runtimeSessionId: tracker.resumable,
    provider,
    model,
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
    console.error("[coach] could not save the chat", {
      _e: errorText(error),
      stateFile,
    });
  }
}

function changeFeedback(input: CoachFeedback | null): Response {
  try {
    store = saveFeedback(stateFile, store, input);
    applyCoaching();
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("[coach] could not save feedback", { _e: errorText(error) });
    return new Response("Could not save feedback. Try again.", { status: 503 });
  }
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(persistNow, 500);
}

function notice(text: string) {
  feed({ type: CoachEventType.Notice, text });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function status(): StatusEvent {
  return {
    type: CoachEventType.Status,
    provider,
    project,
    model,
    busy,
    appConnected: bridge !== null,
    meeting: chatSessionId !== undefined,
    proactive: proactiveView(),
    ...(chatSessionId
      ? {
          coaching: {
            ...meetingCoachingSchema.parse(coachingFor(store, chatSessionId)),
            sessionId: chatSessionId,
          },
        }
      : {}),
    setup,
  };
}

function proactiveView(): ProactiveView {
  return (
    proactive?.view() ?? {
      state: proactiveConfig.enabled ? ProactiveState.On : ProactiveState.Off,
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
  nudgeAbort?.abort();
  nudgeAbort = null;
  proactiveMeeting = sessionId;
  const current = new Proactive(proactiveConfig, {
    triage: async (request) =>
      runTriage(request, {
        signal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
        claudePath: await executable(selected.provider),
        provider: selected.provider,
        model: selected.model,
        codexHome,
      }),
    nudge: (request) => {
      if (!coach || busy || nudgeAbort || proactive !== current)
        return NudgeDispatch.Retry;
      const sourceLines = request.hits.length
        ? request.hits.flatMap((hit) => {
            const line = request.lines[hit.lineIndex];
            return line ? [line] : [];
          })
        : request.lines.slice(-1);
      if (
        sessionId &&
        sourceLines.some((line) =>
          isHandledMoment(
            store,
            evidenceMomentId({
              sessionId,
              timestampMs: line.start_ms,
            }),
          ),
        )
      )
        return NudgeDispatch.Drop;
      void runLightNudge(current, request);
      return NudgeDispatch.Started;
    },
    busy: () => busy || nudgeAbort !== null,
    context: () => (sessionId ? meetingContext(sessionId) : "Untitled"),
    changed: () => broadcast(status()),
    metric: (metric) => console.info("[coach] proactive metric", metric),
  });
  proactive = current;
  applyCoaching();
}

function applyCoaching() {
  nudgeAbort?.abort();
  nudgeAbort = null;
  proactive?.setCoaching(
    chatSessionId ? coachingFor(store, chatSessionId) : DEFAULT_COACHING,
    store.feedback.carefulTiming,
  );
  broadcast(status());
}

async function runLightNudge(owner: Proactive, request: NudgeRequest) {
  const sessionId = proactiveMeeting;
  const hits = prioritizeHitsByFeedback(store, request.hits);
  const abort = new AbortController();
  nudgeAbort = abort;
  const startedAt = Date.now();
  const label = `${nudgeLabel(hits)} · ${clockTime()}`;
  const { result, outcome } = await deliverNudge(
    () =>
      executable(selected.provider)
        .then((claudePath) =>
          runNudge(
            { ...request, hits, sessionId },
            {
              instructions: options.instructions ?? "",
              signal: AbortSignal.any([
                abort.signal,
                AbortSignal.timeout(NUDGE_TIMEOUT_MS),
              ]),
              claudePath,
              provider: selected.provider,
              model: selected.model,
              fast: request.path === NudgePath.Fast,
              codexHome,
            },
          ),
        )
        .catch((error: unknown) => ({
          ok: false as const,
          error: errorText(error),
          spend: NO_SPEND,
        })),
    {
      signal: abort.signal,
      current: () =>
        nudgeAbort === abort &&
        proactive === owner &&
        chatSessionId === sessionId &&
        !busy,
      canDeliver: () => {
        const transcript = readTranscript();
        if (
          !transcript ||
          transcript.sessionId !== sessionId ||
          !transcript.live ||
          transcript.paused
        )
          return false;
        owner.observe({
          lines: transcript.lines,
          pending: transcript.pending,
          live: transcript.live && !transcript.paused,
          selfName,
        });
        return owner.canDeliver(request);
      },
      defer: (note) => {
        if (!sessionId) return;
        store = deferCoaching(store, sessionId, note);
        saveStore();
      },
      publish: (move) => {
        feed({ type: CoachEventType.User, kind: TurnKind.Nudge, text: label });
        feed({
          type: CoachEventType.Block,
          id: crypto.randomUUID(),
          block: { kind: BlockKind.Move, ...move },
        });
        feed({
          type: CoachEventType.Done,
          seconds: (Date.now() - startedAt) / 1000,
          ok: true,
          silent: false,
          interrupted: false,
        });
        if (bridge && sessionId) {
          void bridge
            .nudged(sessionId, { tag: move.tag, line: move.line })
            .catch((error: unknown) => {
              console.error("[coach] could not tell the app about a nudge", {
                _e: errorText(error),
                sessionId,
              });
            });
        }
        nudgeNotes = rememberNote(nudgeNotes, nudgeNote(label, moveText(move)));
        persistNow();
      },
    },
  );
  owner.reportMetric({
    path: request.path,
    outcome,
    latencyMs: Math.max(0, Date.now() - request.observedAtMs),
    modelCalls: request.path === NudgePath.Fallback ? 2 : 1,
    tokens: request.priorSpend.tokens + result.spend.tokens,
    cachedTokens: request.priorSpend.cachedTokens + result.spend.cachedTokens,
  });
  owner.spend(SpendSource.Nudges, result.spend);
  if (nudgeAbort === abort) nudgeAbort = null;
  if (!result.ok && !abort.signal.aborted)
    console.error("[coach] background suggestion failed", { _e: result.error });
}

function clockTime(): string {
  return new Date().toTimeString().slice(0, 5);
}

function evidenceForMoment(
  moment: Moment,
  sessionId: string,
  lines: readonly TranscriptLine[],
): EvidenceTarget | undefined {
  const source = lines.find(
    (line) =>
      line.speaker === moment.speaker &&
      (line.text.includes(moment.quote) ||
        moment.quote.includes(line.text.trim())),
  );
  if (source) return { sessionId, timestampMs: source.start_ms };
  if (!moment.at) return undefined;
  const [minutes, seconds] = moment.at.split(":").map(Number);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || seconds! > 59)
    return undefined;
  return { sessionId, timestampMs: (minutes! * 60 + seconds!) * 1_000 };
}

function projectView(resolved: MeetingProject): ProjectView {
  return {
    path: resolved.project,
    source: resolved.source,
    series: resolved.series?.label ?? null,
    defaultProject: resolved.default_project,
    needsFolder: noProject && resolved.source === ProjectSource.Default,
  };
}

async function projectFor(sessionId: string | undefined): Promise<ProjectView> {
  if (!bridge || !sessionId) return defaultProject;
  try {
    return projectView(await bridge.meetingProject(sessionId));
  } catch (error) {
    console.error("[coach] could not resolve the meeting's project", {
      _e: errorText(error),
      sessionId,
    });
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

function settleTurn(input: {
  ok: boolean;
  interrupted: boolean;
  silent?: boolean;
}) {
  const silent = input.silent ?? false;
  busy = false;
  const done: CoachEvent = {
    type: CoachEventType.Done,
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

const supervisor = new Supervisor<RuntimeMessage>({
  handle,
  ended: (ours) => {
    coach?.close();
    coach = null;
    if (busy) settleTurn({ ok: false, interrupted: ours });
  },
  failed: (message) => {
    console.error("[coach] the coach session stopped", { _e: message });
    feed({
      type: CoachEventType.Error,
      error: coachError({ message, provider, stderr: stderr.take() }),
    });
  },
  gaveUp: (message) => {
    console.error(
      "[coach] the coach session keeps stopping; not restarting it",
      { _e: message },
    );
    feed({
      type: CoachEventType.Error,
      error: {
        ...coachError({ message, provider, stderr: stderr.take() }),
        ...GAVE_UP,
      },
    });
  },
  forget: (id) => {
    console.error(
      "[coach] The provider has no conversation to resume; starting a fresh one",
      { runtimeSessionId: id },
    );
    tracker.resumable = null;
    if (!chatSessionId) return;
    store = dropResume(store, chatSessionId);
    saveStore();
  },
  restart: () => enqueue(() => openChat(ResumeReason.Recover)),
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
      feed({ type: CoachEventType.Edit, edit });
    },
    onUndo(edit: CoachEdit) {
      feed({ type: CoachEventType.Undone, id: edit.id, summary: edit.summary });
    },
  };
}

function rememberEdits(events: readonly CoachEvent[]) {
  for (const event of events)
    if (event.type === CoachEventType.Edit)
      editSessions.set(event.edit.id, event.edit.session_id);
}

async function openChat(reason: OpenReason) {
  if (reason === ResetReason.Manual) cancelWrapUp();
  const sessionId = attached?.sessionId;
  const nextProject =
    reason === ResumeReason.Recover ? project : await projectFor(sessionId);
  if (reason !== ResumeReason.Recover) {
    persistNow();
    supervisor.reset();
  }
  const plan = planChat({
    reason,
    store,
    meeting: attached,
    conversationId: library ? LIBRARY_CHAT : undefined,
    project: nextProject.path,
    selected,
    current: {
      provider,
      model,
      runtimeSessionId: tracker.resumable,
      project: project.path,
      history,
      seen,
    },
  });
  supervisor.stop();
  coach?.close();
  coach = null;
  provider = plan.provider;
  model = plan.model;
  signedInNow = null;
  questions.dismissAll("The chat was closed.");
  store = plan.store;
  project = nextProject;
  chatSessionId = sessionId;
  history = plan.history;
  seen = plan.seen;
  rememberEdits(history);
  tracker = new TurnTracker();
  tracker.resumable = plan.resume;
  busy = false;
  nudgeAbort?.abort();
  nudgeAbort = null;
  saveStore();
  setSetup({ state: SetupState.Checking });
  const runtimePath = await executable().catch((error: unknown) => {
    setSetup({ state: SetupState.Failed, message: errorText(error) });
    return null;
  });
  if (!runtimePath) return;
  setSetup({ state: SetupState.Ready });
  checkSignIn();
  const session = startCoach({
    ...options,
    scope,
    provider,
    model,
    codexHome,
    ...(provider === CoachProvider.Codex
      ? { pathToCodexExecutable: runtimePath, connectors: {} }
      : { pathToClaudeCodeExecutable: runtimePath }),
    project: project.path,
    meeting: () => (library ? libraryContext : sessionId),
    ...(bridge ? { edits: editHooks(bridge) } : {}),
    ...(plan.resume ? { resume: plan.resume } : {}),
    askUser: (id, asked, signal) => questions.ask(id, asked, signal),
    show: (block) => {
      const transcript = sessionId
        ? readLiveTranscript(db, { sessionId, recording })
        : null;
      const move = block.kind === BlockKind.Move ? block : null;
      const evidence =
        move?.moment && sessionId
          ? evidenceForMoment(move.moment, sessionId, transcript?.lines ?? [])
          : undefined;
      feed({
        type: CoachEventType.Block,
        id: crypto.randomUUID(),
        block: move && evidence ? { ...move, evidence } : block,
      });
    },
    onToolResult: (id, response, name) =>
      tracker.hookResult(id, response, name),
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
  if (reason !== ResumeReason.Recover) nudgeNotes = [];
  startProactive(sessionId);
  if (plan.resume && reason !== ResumeReason.Recover && history.length > 0) {
    history = appendHistory(history, {
      type: CoachEventType.Divider,
      text: "Picked up where you left off",
    });
  }
  if (!wrapUp && plan.wrapUp && sessionId) {
    const { view, transcriptId } = plan.wrapUp;
    wrapUp =
      view.state === WrapUpState.Ready
        ? { ...view, sessionId, actions: actionsFor(view.wrapUp) }
        : view;
    wrapUpMeeting = { sessionId, transcriptId };
  }
  if (reason !== ResumeReason.Startup)
    broadcast({
      type: CoachEventType.Reset,
      reason: reason === ResumeReason.Recover ? ResetReason.Sync : reason,
    });
  for (const event of history) broadcast(event);
  if (reason !== ResumeReason.Startup && wrapUp)
    broadcast({ type: CoachEventType.Wrapup, wrapUp });
  broadcast(status());
  supervisor.watch(session, plan.resume);
}

function startTurn(
  session: CoachSession,
  kind: TurnKind,
  label: string,
  prompt: string,
  images: AskImage[] = [],
) {
  nudgeAbort?.abort();
  nudgeAbort = null;
  busy = true;
  askedAt = Date.now();
  tracker.beginTurn();
  const update = meetingUpdate(seen, meetingNow(), askedAt);
  seen = update.seen;
  const turn = userTurn({
    kind,
    label,
    prompt: withNudgeNotes(
      nudgeNotes,
      `${intentGuidance(chatSessionId ? coachingFor(store, chatSessionId).intent : MeetingIntent.General)}\n\n${prompt}`,
    ),
    line: update.line,
    images,
  });
  feed(turn.event);
  broadcast(status());
  session.ask(turn.content);
  nudgeNotes = [];
}

function runCatchUp(session: CoachSession, lines: LiveTranscript["lines"]) {
  proactive?.caughtUp();
  const since = Math.max(0, (lines.at(-1)?.end_ms ?? 0) - CATCH_UP_WINDOW_MS);
  startTurn(
    session,
    TurnKind.Catchup,
    `Catch me up · ${clockTime()}`,
    catchUpPrompt(since),
  );
  const talk = talkStats(lines, CATCH_UP_WINDOW_MS);
  if (talk) feed({ type: CoachEventType.Talk, talk });
}

function readTranscript() {
  if (library) return null;
  const transcript = readLiveTranscript(db, {
    sessionId: values.session,
    recording,
  });
  return transcript
    ? { ...transcript, paused: pausedRecordings.has(transcript.sessionId) }
    : null;
}

async function refreshRecording() {
  if (!bridge) return;
  try {
    const state = await bridge.recordingState();
    recording = new Set(state.session_ids);
    pausedRecordings = new Set(state.paused_session_ids);
    recordingUnknown = false;
  } catch (error) {
    recording = undefined;
    if (!recordingUnknown)
      console.error("[coach] could not ask the app what it is recording", {
        _e: errorText(error),
      });
    recordingUnknown = true;
  }
}

function transcriptEvent(transcript = readTranscript()): CoachEvent {
  const strip = stripView(transcript);
  return {
    type: CoachEventType.Transcript,
    strip,
    lines:
      strip.state === StripState.Live && transcript
        ? transcript.lines.slice(-6).map((line) => ({
            speaker: line.speaker,
            you: line.channel === 0,
            text: line.text.trim(),
          }))
        : [],
    pending:
      strip.state === StripState.Live && transcript
        ? transcript.pending.trim()
        : "",
  };
}

function setWrapUp(next: WrapUpView | null) {
  wrapUp = next;
  if (wrapUp?.state === WrapUpState.Ready && wrapUpMeeting)
    wrapUp = { ...wrapUp, sessionId: wrapUpMeeting.sessionId };
  broadcast({ type: CoachEventType.Wrapup, wrapUp });
  if (wrapUpMeeting && wrapUp && wrapUp.state !== WrapUpState.Running)
    storeWrapUp(wrapUpMeeting, wrapUp);
}

function storeWrapUp(
  meeting: { sessionId: string; transcriptId: string },
  view: SettledWrapUp,
) {
  store = keepWrapUp(store, meeting.sessionId, {
    transcriptId: meeting.transcriptId,
    view,
    updatedAt: Date.now(),
  });
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
  nudgeAbort?.abort();
  nudgeAbort = null;
  wrapUpAbort?.abort();
  const abort = new AbortController();
  wrapUpAbort = abort;
  wrapUpMeeting = {
    sessionId: transcript.sessionId,
    transcriptId: transcript.transcriptId,
  };
  const title = transcript.title;
  setWrapUp({ state: WrapUpState.Running, title });
  executable(selected.provider)
    .then((claudePath) =>
      generateWrapUp(transcript, readMeetingInfo(db, transcript.sessionId), {
        intent: coachingFor(store, transcript.sessionId).intent,
        deferred: coachingFor(store, transcript.sessionId).deferred,
        model: selected.model,
        provider: selected.provider,
        codexHome,
        claudePath,
        signal: abort.signal,
      }),
    )
    .then((result) => {
      if (wrapUpAbort !== abort) return;
      setWrapUp({
        state: WrapUpState.Ready,
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
      setWrapUp({
        state: WrapUpState.Failed,
        title,
        message: errorText(error),
      });
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
enqueue(() => openChat(ResumeReason.Startup));

let polling = false;
setInterval(() => {
  if (polling) return;
  polling = true;
  void poll().finally(() => {
    polling = false;
  });
}, 1_000);

async function poll() {
  if (library) return;
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
  if (next?.live && wrapUp) cancelWrapUp();
  if (next) attached = next;
  if (change.newChat) {
    cancelWrapUp();
    enqueue(() => openChat(ResetReason.Meeting));
    return;
  }
  if (change.wrapUp && transcript) {
    wrapped.add(transcript.transcriptId);
    startWrapUp(transcript);
  }

  if (!transcript || !coach || transcript.sessionId !== chatSessionId) return;
  proactive?.observe({
    lines: transcript.lines,
    pending: transcript.pending,
    live: transcript.live && !transcript.paused,
    selfName,
  });
}

function handle(message: RuntimeMessage) {
  if (message.type === RuntimeMessageType.Result) {
    const interrupted = interrupter?.pending ?? false;
    interrupter?.settled();
    const outcome = tracker.finishTurn(message, {
      interrupted,
      stderr: stderr.take(),
    });
    if (outcome.ok) supervisor.reset();
    if (outcome.sources.length > 0)
      feed({ type: CoachEventType.Sources, sources: outcome.sources });
    if (outcome.usage) {
      feed({ type: CoachEventType.Usage, usage: outcome.usage });
      proactive?.spend(
        SpendSource.Asks,
        spendOf(outcome.usage.model ?? model, outcome.usage),
      );
    }
    if (outcome.error)
      feed({ type: CoachEventType.Error, error: outcome.error });
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

async function changeSeriesProject(
  change: (
    bridge: AppBridge,
    sessionId: string,
  ) => Promise<MeetingProject | null>,
) {
  if (!bridge || !chatSessionId)
    return conflict("Open the coach from the app during a meeting first.");
  const sessionId = chatSessionId;
  return bridgeCall(async () => {
    const resolved = await change(bridge, sessionId);
    if (resolved && resolved.project !== project.path)
      enqueue(() => openChat(ResetReason.Project));
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
    return body && typeof body === "object" && !Array.isArray(body)
      ? Object.fromEntries(Object.entries(body))
      : {};
  } catch {
    return {};
  }
}

function projectImage(requested: string) {
  return resolveImageFile(
    requested,
    project.path,
    readRoots({ ...options, project: project.path }),
  );
}

function blockItemRef(body: Record<string, unknown>): BlockItemRef | null {
  const id = typeof body.block_id === "string" ? body.block_id : "";
  const index =
    typeof body.index === "number" && Number.isInteger(body.index)
      ? body.index
      : -1;
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
          controller.enqueue(
            frame({ type: CoachEventType.Reset, reason: ResetReason.Sync }),
          );
          for (const event of history) controller.enqueue(frame(event));
          if (wrapUp)
            controller.enqueue(frame({ type: CoachEventType.Wrapup, wrapUp }));
        },
        cancel() {
          clients.delete(controller);
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        },
      });
    },
    "/dictation": { POST: dictationHandler(bridge) },
    "/busy": () =>
      Response.json({ busy: isAnswering(busy, wrapUp, nudgeAbort !== null) }),
    "/ask": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const text = typeof body.text === "string" ? body.text.trim() : "";
        const images = parseAskImages(body.images);
        if (!images.ok) return new Response(images.error, { status: 400 });
        if (!text && images.images.length === 0)
          return new Response("Type a question first.", { status: 400 });
        if (!coach)
          return new Response("The coach is starting. Try again in a moment.", {
            status: 503,
          });
        if (busy)
          return conflict(
            "The coach is still answering. Stop it first, or wait a moment.",
          );
        if (library && "contextSessionId" in body) {
          const id = body.contextSessionId;
          if (
            id !== null &&
            (typeof id !== "string" || !readMeetingInfo(db, id))
          )
            return new Response("That note is no longer available.", {
              status: 404,
            });
          libraryContext = typeof id === "string" ? id : undefined;
        }
        const prompt =
          library && libraryContext
            ? `[Current note context: ${libraryContext}. Title: ${meetingBasics(libraryContext).title}. Use only if relevant to this request.]\n${text}`
            : text;
        startTurn(coach, TurnKind.Ask, text, prompt, images.images);
        return new Response(null, { status: 204 });
      },
    },
    "/blocks/check": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const ref = blockItemRef(body);
        if (!ref || typeof body.checked !== "boolean")
          return new Response("That item no longer exists.", { status: 404 });
        feed({
          type: CoachEventType.BlockCheck,
          id: ref.id,
          index: ref.index,
          checked: body.checked,
        });
        return new Response(null, { status: 204 });
      },
    },
    "/blocks/action-item": {
      POST: async (request) => {
        const ref = blockItemRef(await jsonBody(request));
        const block = ref && findBlock(history, ref.id);
        const item =
          ref && block?.kind === BlockKind.Actions
            ? block.items[ref.index]
            : undefined;
        if (!ref || !item)
          return new Response("That item no longer exists.", { status: 404 });
        const key = `${ref.id}:${ref.index}`;
        if (addingBlockItems.has(key) || addedBlockItem(history, ref))
          return conflict("That item is already in the notes.");
        if (!bridge || !chatSessionId)
          return conflict(
            "Open the coach from the app during a meeting to add to the notes.",
          );
        const sessionId = chatSessionId;
        addingBlockItems.add(key);
        return bridgeCall(async () => {
          try {
            const edit = await bridge.addActionItem(
              sessionId,
              actionItemText(item),
            );
            editSessions.set(edit.id, edit.session_id);
            feed({ type: CoachEventType.Edit, edit, block: ref });
            return new Response(null, { status: 204 });
          } finally {
            addingBlockItems.delete(key);
          }
        });
      },
    },
    "/checkin": {
      POST: () => {
        if (busy)
          return conflict(
            "The coach is answering. Check in again when it's done.",
          );
        if (!coach)
          return new Response("The coach is starting. Try again in a moment.", {
            status: 503,
          });
        const transcript = readTranscript();
        if (!transcript?.live || transcript.sessionId !== chatSessionId) {
          return new Response("Check-ins need a meeting that's recording.", {
            status: 404,
          });
        }
        runCatchUp(coach, transcript.lines);
        return new Response(null, { status: 204 });
      },
    },
    "/stop": {
      POST: () => {
        nudgeAbort?.abort();
        nudgeAbort = null;
        if (busy) interrupter?.request();
        return new Response(null, { status: 204 });
      },
    },
    "/question": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const id = typeof body.id === "string" ? body.id : "";
        const answers = Array.isArray(body.answers)
          ? body.answers.filter((answer) => typeof answer === "string")
          : null;
        const settled = answers
          ? questions.answer(id, answers)
          : questions.dismiss(id);
        return settled
          ? new Response(null, { status: 204 })
          : new Response("That question is closed.", { status: 404 });
      },
    },
    "/open": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const url = typeof body.url === "string" ? body.url : "";
        if (!/^https?:\/\//i.test(url))
          return new Response("Only web links can be opened.", { status: 400 });
        Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
        return new Response(null, { status: 204 });
      },
    },
    "/file": {
      GET: (request) => {
        const image = projectImage(
          new URL(request.url).searchParams.get("path") ?? "",
        );
        if (!image.ok)
          return new Response(image.reason, { status: image.status });
        return new Response(Bun.file(image.file), {
          headers: imageHeaders(image.type),
        });
      },
    },
    "/open-image": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const image = projectImage(
          typeof body.path === "string" ? body.path : "",
        );
        if (!image.ok)
          return new Response(image.reason, { status: image.status });
        Bun.spawn(["open", "--", image.file], {
          stdout: "ignore",
          stderr: "ignore",
        });
        return new Response(null, { status: 204 });
      },
    },
    "/sign-in": {
      POST: async () => {
        if (signingIn) return conflict("Sign-in is already in progress.");
        const runtimePath = await executable().catch(() => null);
        if (!runtimePath)
          return new Response(
            "The coach is still setting up. Sign in once it's ready.",
            { status: 503 },
          );
        if (provider === CoachProvider.Codex) {
          signingIn = true;
          void signInCodex(runtimePath, codexHome)
            .then(checkSignIn)
            .catch((error: unknown) => {
              feed({
                type: CoachEventType.Error,
                error: coachError({
                  message: errorText(error),
                  provider: CoachProvider.Codex,
                }),
              });
            })
            .finally(() => {
              signingIn = false;
            });
        } else
          Bun.spawn(signInCommand(runtimePath), {
            stdout: "ignore",
            stderr: "ignore",
          });
        return new Response(null, { status: 204 });
      },
    },
    "/setup/retry": {
      POST: () => {
        if (setup.state !== SetupState.Failed)
          return conflict("There's nothing to retry.");
        retrySetup();
        return new Response(null, { status: 204 });
      },
    },
    "/feedback": {
      POST: async (request) => {
        const feedback = coachFeedbackSchema.safeParse(await jsonBody(request));
        if (!feedback.success)
          return new Response("That nudge feedback is invalid.", {
            status: 400,
          });
        return changeFeedback(feedback.data);
      },
    },
    "/coaching": {
      POST: async (request) => {
        const parsed = z
          .strictObject({
            sessionId: z.string().min(1),
            intent: meetingIntentSchema.optional(),
            quiet: z.boolean().optional(),
          })
          .safeParse(await jsonBody(request));
        if (!parsed.success)
          return new Response("Those coaching preferences are invalid.", {
            status: 400,
          });
        const transcript = readTranscript();
        if (
          !chatSessionId ||
          parsed.data.sessionId !== chatSessionId ||
          transcript?.sessionId !== chatSessionId ||
          !transcript.live
        )
          return conflict("These controls apply to the current live meeting.");
        const { sessionId, ...patch } = parsed.data;
        try {
          const updated = setMeetingCoaching(store, sessionId, patch);
          saveChats(stateFile, updated);
          store = updated;
          applyCoaching();
          return new Response(null, { status: 204 });
        } catch (error) {
          console.error("[coach] could not save meeting preferences", {
            _e: errorText(error),
          });
          return new Response("Could not save your preference. Try again.", {
            status: 503,
          });
        }
      },
    },
    "/feedback/reset": {
      POST: () => changeFeedback(null),
    },
    "/evidence": {
      POST: async (request) => {
        const target = evidenceTargetSchema.safeParse(await jsonBody(request));
        if (!target.success || !bridge)
          return new Response("That transcript moment is unavailable.", {
            status: 400,
          });
        await bridge.evidence(target.data);
        return new Response(null, { status: 204 });
      },
    },
    "/new-chat": {
      POST: () => {
        enqueue(() => openChat(ResetReason.Manual));
        return new Response(null, { status: 204 });
      },
    },
    "/project": {
      POST: () => {
        if (!bridge)
          return conflict("Open the coach from the app to choose a folder.");
        const app = bridge;
        return bridgeCall(async () => {
          await app.chooseDefaultProject();
          return new Response(null, { status: 204 });
        });
      },
    },
    "/project/series": {
      POST: () =>
        changeSeriesProject((bridge, sessionId) =>
          bridge.chooseSeriesProject(sessionId),
        ),
      DELETE: () =>
        changeSeriesProject((bridge, sessionId) =>
          bridge.clearSeriesProject(sessionId),
        ),
    },
    "/undo": {
      POST: async (request) => {
        const body = await jsonBody(request);
        const editId = typeof body.edit_id === "string" ? body.edit_id : "";
        const sessionId = editSessions.get(editId);
        if (!bridge || sessionId === undefined)
          return new Response("That edit can no longer be undone here.", {
            status: 404,
          });
        return bridgeCall(async () => {
          const edit = await bridge.undo(sessionId ?? undefined, editId);
          feed({
            type: CoachEventType.Undone,
            id: edit.id,
            summary: edit.summary,
          });
          return new Response(null, { status: 204 });
        });
      },
    },
    "/wrapup/action-items": {
      POST: () => {
        if (
          wrapUp?.state !== WrapUpState.Ready ||
          !wrapUp.actions.addActionItems.enabled ||
          wrapUp.added
        ) {
          return conflict("There's nothing to add.");
        }
        if (!bridge || !wrapUpMeeting)
          return conflict("Open the coach from the app to add action items.");
        const ready = wrapUp;
        const meeting = wrapUpMeeting;
        const hooks = editHooks(bridge);
        let added = 0;
        return bridgeCall(async () => {
          try {
            for (const commitment of ready.commitments) {
              hooks.onEdit(
                await bridge.addActionItem(meeting.sessionId, commitment),
              );
              added += 1;
            }
          } finally {
            if (added > 0 && wrapUpMeeting === meeting)
              setWrapUp({ ...ready, added: true });
            else if (added > 0) storeWrapUp(meeting, { ...ready, added: true });
          }
          return new Response(null, { status: 204 });
        });
      },
    },
    "/wrapup/log-clients": {
      POST: () => {
        if (
          wrapUp?.state !== WrapUpState.Ready ||
          !wrapUp.actions.logToClients.enabled ||
          wrapUp.logged
        ) {
          return conflict("There's nothing to log.");
        }
        if (busy)
          return conflict("The coach is answering. Try again when it's done.");
        if (!coach)
          return new Response("The coach is starting. Try again in a moment.", {
            status: 503,
          });
        startTurn(
          coach,
          TurnKind.Ask,
          "Log promises to clients",
          logToClientsPrompt(wrapUp.title, wrapUp.wrapUp),
        );
        setWrapUp({ ...wrapUp, logged: true });
        return new Response(null, { status: 204 });
      },
    },
  }),
});

console.error(
  `[coach] http://${server.hostname}:${server.port} · project ${options.project}`,
);
if (!launchToken)
  console.error(
    `[coach] no ${TOKEN_ENV} set; sign in once at ${loginUrl(access)}`,
  );
