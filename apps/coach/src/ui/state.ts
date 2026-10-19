import type { CoachEdit } from "../app-bridge";
import type { ActionItem, Block } from "../blocks";
import type { CoachError } from "../errors";
import type { ImageThumb } from "../image-limits";
import type { Move } from "../move";
import type { CoachEvent, StatusEvent, TurnKind, WrapUpView } from "../protocol";
import type { Question } from "../questions";
import type { Source } from "../sources";
import type { TalkStats } from "../talk-time";
import type { TurnUsage } from "../usage";

export type StepStatus = "running" | "ok" | "failed" | "stopped";

export type Step = {
  id: string;
  name: string;
  label: string;
  activeLabel: string;
  detail: string | null;
  status: StepStatus;
  output: string | null;
  durationMs: number | null;
};

export type EditView = { id: string; summary: string; kind: CoachEdit["kind"]; undone: boolean; seq: number };

export type ActionItemView = ActionItem & { checked: boolean; edit: EditView | null };

export type BlockView =
  | { id: string; kind: "actions"; items: ActionItemView[] }
  | { id: string; kind: "replies"; options: string[] }
  | ({ id: string; kind: "move" } & Move);

export type TurnStatus = "sending" | "running" | "done" | "stopped" | "failed";

export type Turn = {
  kind: "turn";
  key: string;
  ask: TurnKind;
  prompt: string;
  images: ImageThumb[];
  text: string;
  steps: Step[];
  edits: EditView[];
  blocks: BlockView[];
  sources: Source[];
  talk: TalkStats | null;
  status: TurnStatus;
  seconds: number | null;
};

export type Item =
  | Turn
  | { kind: "edit"; key: string; edit: EditView }
  | { kind: "error"; key: string; error: CoachError }
  | { kind: "notice"; key: string; text: string }
  | { kind: "divider"; key: string; text: string };

export type TranscriptView = Extract<CoachEvent, { type: "transcript" }>;

export type Connection = "connecting" | "open" | "lost";

export type CoachState = {
  connection: Connection;
  status: StatusEvent | null;
  transcript: TranscriptView | null;
  items: Item[];
  question: { id: string; questions: Question[] } | null;
  usage: TurnUsage | null;
  wrapUp: WrapUpView | null;
  serial: number;
};

export const initialState: CoachState = {
  connection: "connecting",
  status: null,
  transcript: null,
  items: [],
  question: null,
  usage: null,
  wrapUp: null,
  serial: 0,
};

export type Action =
  | { type: "event"; event: CoachEvent }
  | { type: "events"; events: readonly CoachEvent[] }
  | { type: "connection"; connection: Connection }
  | { type: "send"; prompt: string; images?: ImageThumb[] }
  | { type: "send_failed"; prompt: string; message: string };

function key(state: CoachState, prefix: string): [string, number] {
  const serial = state.serial + 1;
  return [`${prefix}-${serial}`, serial];
}

function lastTurnIndex(items: readonly Item[], match: (turn: Turn) => boolean = () => true): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === "turn" && match(item)) return index;
  }
  return -1;
}

const isOpen = (turn: Turn) => turn.status === "running" || turn.status === "sending";

function updateTurn(state: CoachState, update: (turn: Turn) => Turn, match: (turn: Turn) => boolean = isOpen): CoachState {
  const index = lastTurnIndex(state.items, match);
  const turn = index === -1 ? undefined : state.items[index];
  if (!turn || turn.kind !== "turn") return state;
  const items = [...state.items];
  items[index] = update(turn);
  return { ...state, items };
}

function updateEdit(items: readonly Item[], id: string, update: (edit: EditView) => EditView): Item[] {
  return items.map((item) => {
    if (item.kind === "edit" && item.edit.id === id) return { ...item, edit: update(item.edit) };
    if (item.kind !== "turn") return item;
    const inBlock = item.blocks.some(
      (block) => block.kind === "actions" && block.items.some((entry) => entry.edit?.id === id),
    );
    if (!inBlock && !item.edits.some((edit) => edit.id === id)) return item;
    return {
      ...item,
      edits: item.edits.map((edit) => (edit.id === id ? update(edit) : edit)),
      blocks: item.blocks.map((block) =>
        block.kind === "actions"
          ? {
              ...block,
              items: block.items.map((entry) =>
                entry.edit?.id === id ? { ...entry, edit: update(entry.edit) } : entry,
              ),
            }
          : block,
      ),
    };
  });
}

function updateBlockItem(
  state: CoachState,
  blockId: string,
  index: number,
  update: (item: ActionItemView) => ActionItemView,
): CoachState {
  const items = state.items.map((item) => {
    if (item.kind !== "turn" || !item.blocks.some((block) => block.id === blockId)) return item;
    return {
      ...item,
      blocks: item.blocks.map((block) =>
        block.id === blockId && block.kind === "actions"
          ? { ...block, items: block.items.map((entry, position) => (position === index ? update(entry) : entry)) }
          : block,
      ),
    };
  });
  return { ...state, items };
}

function blockView(id: string, block: Block): BlockView {
  switch (block.kind) {
    case "actions":
      return { id, kind: "actions", items: block.items.map((item) => ({ ...item, checked: false, edit: null })) };
    case "replies":
      return { id, kind: "replies", options: block.options };
    case "move":
      return { id, ...block };
  }
}

function updateCurrentTurn(state: CoachState, update: (turn: Turn) => Turn): CoachState {
  return lastTurnIndex(state.items, isOpen) === -1 ? updateTurn(state, update, () => true) : updateTurn(state, update);
}

function newTurn(keyValue: string, ask: TurnKind, prompt: string, status: TurnStatus, images: ImageThumb[] = []): Turn {
  return {
    kind: "turn",
    key: keyValue,
    ask,
    prompt,
    images,
    text: "",
    steps: [],
    edits: [],
    blocks: [],
    sources: [],
    talk: null,
    status,
    seconds: null,
  };
}

function applyEvent(state: CoachState, event: CoachEvent): CoachState {
  switch (event.type) {
    case "status":
      return { ...state, status: event };
    case "transcript":
      return { ...state, transcript: event };
    case "wrapup":
      return { ...state, wrapUp: event.wrapUp };
    case "reset":
      return { ...state, items: [], question: null, usage: event.reason === "sync" ? state.usage : null };
    case "user": {
      const pending = lastTurnIndex(state.items, (turn) => turn.status === "sending");
      const pendingTurn = pending === -1 ? undefined : state.items[pending];
      if (event.kind === "ask" && pendingTurn?.kind === "turn" && pendingTurn.prompt === event.text) {
        const items = [...state.items];
        items[pending] = { ...pendingTurn, status: "running", images: event.images ?? pendingTurn.images };
        return { ...state, items };
      }
      const [turnKey, serial] = key(state, "turn");
      return {
        ...state,
        serial,
        items: [...state.items, newTurn(turnKey, event.kind, event.text, "running", event.images)],
      };
    }
    case "block":
      return updateCurrentTurn(state, (turn) => ({ ...turn, blocks: [...turn.blocks, blockView(event.id, event.block)] }));
    case "block_check":
      return updateBlockItem(state, event.id, event.index, (item) => ({ ...item, checked: event.checked }));
    case "sources":
      return updateCurrentTurn(state, (turn) => ({ ...turn, sources: event.sources }));
    case "talk":
      return updateCurrentTurn(state, (turn) => ({ ...turn, talk: event.talk }));
    case "text":
      return updateTurn(state, (turn) => ({ ...turn, text: turn.text + event.delta }));
    case "tool":
      return updateTurn(state, (turn) => ({
        ...turn,
        steps: [
          ...turn.steps,
          {
            id: event.id,
            name: event.name,
            label: event.label,
            activeLabel: event.activeLabel,
            detail: event.detail,
            status: "running",
            output: null,
            durationMs: null,
          },
        ],
      }));
    case "tool_result":
      return updateTurn(
        state,
        (turn) => ({
          ...turn,
          steps: turn.steps.map((step) =>
            step.id === event.id
              ? { ...step, status: event.ok ? "ok" : "failed", output: event.output, durationMs: event.durationMs }
              : step,
          ),
        }),
        (turn) => turn.steps.some((step) => step.id === event.id),
      );
    case "done": {
      if (event.silent) {
        const index = lastTurnIndex(state.items, isOpen);
        return index === -1 ? state : { ...state, items: state.items.filter((_, position) => position !== index) };
      }
      return updateTurn(state, (turn) => ({
        ...turn,
        status: event.interrupted ? "stopped" : event.ok ? "done" : "failed",
        seconds: event.seconds,
        steps: turn.steps.map((step) => (step.status === "running" ? { ...step, status: "stopped" } : step)),
      }));
    }
    case "edit": {
      const [editKey, serial] = key(state, "edit");
      const edit: EditView = {
        id: event.edit.id,
        summary: event.edit.summary,
        kind: event.edit.kind,
        undone: false,
        seq: serial,
      };
      const next = { ...state, serial };
      if (event.block) return updateBlockItem(next, event.block.id, event.block.index, (item) => ({ ...item, edit }));
      const running = lastTurnIndex(state.items, isOpen);
      if (running !== -1) return updateTurn(next, (turn) => ({ ...turn, edits: [...turn.edits, edit] }));
      return { ...next, items: [...state.items, { kind: "edit", key: editKey, edit }] };
    }
    case "undone":
      return { ...state, items: updateEdit(state.items, event.id, (edit) => ({ ...edit, undone: true })) };
    case "question":
      return { ...state, question: { id: event.id, questions: event.questions } };
    case "question_closed":
      return state.question?.id === event.id ? { ...state, question: null } : state;
    case "usage":
      return { ...state, usage: event.usage };
    case "error": {
      const [errorKey, serial] = key(state, "error");
      return { ...state, serial, items: [...state.items, { kind: "error", key: errorKey, error: event.error }] };
    }
    case "notice": {
      const [noticeKey, serial] = key(state, "notice");
      return { ...state, serial, items: [...state.items, { kind: "notice", key: noticeKey, text: event.text }] };
    }
    case "divider": {
      const [dividerKey, serial] = key(state, "divider");
      return { ...state, serial, items: [...state.items, { kind: "divider", key: dividerKey, text: event.text }] };
    }
  }
}

export function reduce(state: CoachState, action: Action): CoachState {
  switch (action.type) {
    case "event":
      return applyEvent(state, action.event);
    case "events":
      return action.events.reduce(applyEvent, state);
    case "connection":
      return { ...state, connection: action.connection };
    case "send": {
      const [turnKey, serial] = key(state, "turn");
      return {
        ...state,
        serial,
        items: [...state.items, newTurn(turnKey, "ask", action.prompt, "sending", action.images)],
      };
    }
    case "send_failed": {
      const index = lastTurnIndex(state.items, (turn) => turn.status === "sending" && turn.prompt === action.prompt);
      if (index === -1) return state;
      const [noticeKey, serial] = key(state, "notice");
      const items = state.items.filter((_, position) => position !== index);
      return { ...state, serial, items: [...items, { kind: "notice", key: noticeKey, text: action.message }] };
    }
  }
}

export type MeetingPhase = "none" | "live" | "ended";

export function meetingPhase(state: CoachState): MeetingPhase {
  const strip = state.transcript?.strip;
  if (strip?.state === "live") return "live";
  return strip?.lastTitle ? "ended" : "none";
}

export function suggestions(phase: MeetingPhase, followUpReady = false): string[] {
  switch (phase) {
    case "live":
      return ["What did they just ask?", "Any promises so far?"];
    case "ended":
      return followUpReady
        ? ["Make the follow-up shorter", "What should I do first?", "Make it more formal"]
        : ["Draft a follow-up", "What did we agree on?", "What's still open?"];
    case "none":
      return ["Help me prepare for a meeting", "Draft an agenda"];
  }
}

export function chipsAllowed(state: CoachState): boolean {
  if (state.wrapUp?.state === "running") return false;
  return state.items.at(-1)?.kind !== "error";
}

export function isBusy(state: CoachState): boolean {
  return (state.status?.busy ?? false) || state.items.some((item) => item.kind === "turn" && isOpen(item));
}

export function lastAsk(state: CoachState): Turn | null {
  const index = lastTurnIndex(state.items, (turn) => turn.ask === "ask");
  const item = index === -1 ? undefined : state.items[index];
  return item?.kind === "turn" ? item : null;
}

function editsOf(item: Item): EditView[] {
  if (item.kind === "edit") return [item.edit];
  if (item.kind !== "turn") return [];
  const fromBlocks = item.blocks.flatMap((block) =>
    block.kind === "actions" ? block.items.flatMap((entry) => (entry.edit ? [entry.edit] : [])) : [],
  );
  return [...item.edits, ...fromBlocks];
}

export function latestUndoable(state: CoachState): string | null {
  let latest: EditView | null = null;
  for (const edit of state.items.flatMap(editsOf)) {
    if (!edit.undone && (!latest || edit.seq > latest.seq)) latest = edit;
  }
  return latest?.id ?? null;
}
