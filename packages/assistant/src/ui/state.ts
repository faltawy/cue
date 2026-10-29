import { type CoachEdit } from "../app-bridge";
import { type ActionItem, type Block, BlockKind } from "../blocks";
import { type CoachError } from "../errors";
import { type ImageThumb } from "../image-limits";
import { StripState } from "../meeting-state";
import { type Move } from "../move";
import {
  CoachEvent,
  CoachEventType,
  ResetReason,
  StatusEvent,
  TurnKind,
  WrapUpState,
  WrapUpView,
} from "../protocol";
import { type Question } from "../questions";
import { type Source } from "../sources";
import { type TalkStats } from "../talk-time";
import { type TurnUsage } from "../usage";

export enum ActionType {
  Event = "event",
  Events = "events",
  Connection = "connection",
  Send = "send",
  SendFailed = "send_failed",
}

export enum ItemKind {
  Turn = "turn",
  Edit = "edit",
  Error = "error",
  Notice = "notice",
  Divider = "divider",
}

export enum StepStatus {
  Running = "running",
  Ok = "ok",
  Failed = "failed",
  Stopped = "stopped",
}

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

export type EditView = {
  id: string;
  summary: string;
  kind: CoachEdit["kind"];
  undone: boolean;
  seq: number;
};

export type ActionItemView = ActionItem & {
  checked: boolean;
  edit: EditView | null;
};

export type BlockView =
  | { id: string; kind: BlockKind.Actions; items: ActionItemView[] }
  | { id: string; kind: BlockKind.Replies; options: string[] }
  | ({ id: string; kind: BlockKind.Move } & Move);

export enum TurnStatus {
  Sending = "sending",
  Running = "running",
  Done = "done",
  Stopped = "stopped",
  Failed = "failed",
}

export type Turn = {
  kind: ItemKind.Turn;
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
  | { kind: ItemKind.Edit; key: string; edit: EditView }
  | { kind: ItemKind.Error; key: string; error: CoachError; count: number }
  | { kind: ItemKind.Notice; key: string; text: string }
  | { kind: ItemKind.Divider; key: string; text: string };

export type TranscriptView = Extract<
  CoachEvent,
  { type: CoachEventType.Transcript }
>;

export enum Connection {
  Connecting = "connecting",
  Open = "open",
  Lost = "lost",
}

export type CoachState = {
  connection: Connection;
  status: StatusEvent | null;
  transcript: TranscriptView | null;
  items: Item[];
  question: { id: string; questions: Question[] } | null;
  usage: TurnUsage | null;
  wrapUp: WrapUpView | null;
  serial: number;
  dictationOwner: number;
};

export const initialState: CoachState = {
  connection: Connection.Connecting,
  status: null,
  transcript: null,
  items: [],
  question: null,
  usage: null,
  wrapUp: null,
  serial: 0,
  dictationOwner: 0,
};

export type Action =
  | { type: ActionType.Event; event: CoachEvent }
  | { type: ActionType.Events; events: readonly CoachEvent[] }
  | { type: ActionType.Connection; connection: Connection }
  | { type: ActionType.Send; prompt: string; images?: ImageThumb[] }
  | { type: ActionType.SendFailed; prompt: string; message: string };

function key(state: CoachState, prefix: string): [string, number] {
  const serial = state.serial + 1;
  return [`${prefix}-${serial}`, serial];
}

function lastTurnIndex(
  items: readonly Item[],
  match: (turn: Turn) => boolean = () => true,
): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item?.kind === ItemKind.Turn && match(item)) return index;
  }
  return -1;
}

const isOpen = (turn: Turn) =>
  turn.status === TurnStatus.Running || turn.status === TurnStatus.Sending;

function updateTurn(
  state: CoachState,
  update: (turn: Turn) => Turn,
  match: (turn: Turn) => boolean = isOpen,
): CoachState {
  const index = lastTurnIndex(state.items, match);
  const turn = index === -1 ? undefined : state.items[index];
  if (!turn || turn.kind !== ItemKind.Turn) return state;
  const items = [...state.items];
  items[index] = update(turn);
  return { ...state, items };
}

function updateEdit(
  items: readonly Item[],
  id: string,
  update: (edit: EditView) => EditView,
): Item[] {
  return items.map((item) => {
    if (item.kind === ItemKind.Edit && item.edit.id === id)
      return { ...item, edit: update(item.edit) };
    if (item.kind !== ItemKind.Turn) return item;
    const inBlock = item.blocks.some(
      (block) =>
        block.kind === BlockKind.Actions &&
        block.items.some((entry) => entry.edit?.id === id),
    );
    if (!inBlock && !item.edits.some((edit) => edit.id === id)) return item;
    return {
      ...item,
      edits: item.edits.map((edit) => (edit.id === id ? update(edit) : edit)),
      blocks: item.blocks.map((block) =>
        block.kind === BlockKind.Actions
          ? {
              ...block,
              items: block.items.map((entry) =>
                entry.edit?.id === id
                  ? { ...entry, edit: update(entry.edit) }
                  : entry,
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
    if (
      item.kind !== ItemKind.Turn ||
      !item.blocks.some((block) => block.id === blockId)
    )
      return item;
    return {
      ...item,
      blocks: item.blocks.map((block) =>
        block.id === blockId && block.kind === BlockKind.Actions
          ? {
              ...block,
              items: block.items.map((entry, position) =>
                position === index ? update(entry) : entry,
              ),
            }
          : block,
      ),
    };
  });
  return { ...state, items };
}

function blockView(id: string, block: Block): BlockView {
  switch (block.kind) {
    case BlockKind.Actions:
      return {
        id,
        kind: BlockKind.Actions,
        items: block.items.map((item) => ({
          ...item,
          checked: false,
          edit: null,
        })),
      };
    case BlockKind.Replies:
      return { id, kind: BlockKind.Replies, options: block.options };
    case BlockKind.Move:
      return { id, ...block };
  }
}

function updateCurrentTurn(
  state: CoachState,
  update: (turn: Turn) => Turn,
): CoachState {
  return lastTurnIndex(state.items, isOpen) === -1
    ? updateTurn(state, update, () => true)
    : updateTurn(state, update);
}

function newTurn(
  keyValue: string,
  ask: TurnKind,
  prompt: string,
  status: TurnStatus,
  images: ImageThumb[] = [],
): Turn {
  return {
    kind: ItemKind.Turn,
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

function sameError(a: CoachError, b: CoachError): boolean {
  return (
    a.kind === b.kind &&
    a.title === b.title &&
    a.message === b.message &&
    a.action === b.action
  );
}

function applyEvent(state: CoachState, event: CoachEvent): CoachState {
  switch (event.type) {
    case CoachEventType.Attention:
      return state;
    case CoachEventType.Status:
      return { ...state, status: event };
    case CoachEventType.Transcript:
      return { ...state, transcript: event };
    case CoachEventType.Wrapup:
      return { ...state, wrapUp: event.wrapUp };
    case CoachEventType.Reset:
      return {
        ...state,
        dictationOwner: state.dictationOwner + 1,
        items: [],
        question: null,
        usage: event.reason === ResetReason.Sync ? state.usage : null,
        wrapUp: event.reason === ResetReason.Sync ? state.wrapUp : null,
      };
    case CoachEventType.User: {
      const pending = lastTurnIndex(
        state.items,
        (turn) => turn.status === TurnStatus.Sending,
      );
      const pendingTurn = pending === -1 ? undefined : state.items[pending];
      if (
        event.kind === TurnKind.Ask &&
        pendingTurn?.kind === ItemKind.Turn &&
        pendingTurn.prompt === event.text
      ) {
        const items = [...state.items];
        items[pending] = {
          ...pendingTurn,
          status: TurnStatus.Running,
          images: event.images ?? pendingTurn.images,
        };
        return { ...state, items };
      }
      const [turnKey, serial] = key(state, "turn");
      return {
        ...state,
        serial,
        items: [
          ...state.items,
          newTurn(
            turnKey,
            event.kind,
            event.text,
            TurnStatus.Running,
            event.images,
          ),
        ],
      };
    }
    case CoachEventType.Block:
      return updateCurrentTurn(state, (turn) => ({
        ...turn,
        blocks: [...turn.blocks, blockView(event.id, event.block)],
      }));
    case CoachEventType.BlockCheck:
      return updateBlockItem(state, event.id, event.index, (item) => ({
        ...item,
        checked: event.checked,
      }));
    case CoachEventType.Sources:
      return updateCurrentTurn(state, (turn) => ({
        ...turn,
        sources: event.sources,
      }));
    case CoachEventType.Talk:
      return updateCurrentTurn(state, (turn) => ({
        ...turn,
        talk: event.talk,
      }));
    case CoachEventType.Text:
      return updateTurn(state, (turn) => ({
        ...turn,
        text: turn.text + event.delta,
      }));
    case CoachEventType.Tool:
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
            status: StepStatus.Running,
            output: null,
            durationMs: null,
          },
        ],
      }));
    case CoachEventType.ToolResult:
      return updateTurn(
        state,
        (turn) => ({
          ...turn,
          steps: turn.steps.map((step) =>
            step.id === event.id
              ? {
                  ...step,
                  status: event.ok ? StepStatus.Ok : StepStatus.Failed,
                  output: event.output,
                  durationMs: event.durationMs,
                }
              : step,
          ),
        }),
        (turn) => turn.steps.some((step) => step.id === event.id),
      );
    case CoachEventType.Done: {
      if (event.silent) {
        const index = lastTurnIndex(state.items, isOpen);
        return index === -1
          ? state
          : {
              ...state,
              items: state.items.filter((_, position) => position !== index),
            };
      }
      return updateTurn(state, (turn) => ({
        ...turn,
        status: event.interrupted
          ? TurnStatus.Stopped
          : event.ok
            ? TurnStatus.Done
            : TurnStatus.Failed,
        seconds: event.seconds,
        steps: turn.steps.map((step) =>
          step.status === StepStatus.Running
            ? { ...step, status: StepStatus.Stopped }
            : step,
        ),
      }));
    }
    case CoachEventType.Edit: {
      const [editKey, serial] = key(state, "edit");
      const edit: EditView = {
        id: event.edit.id,
        summary: event.edit.summary,
        kind: event.edit.kind,
        undone: false,
        seq: serial,
      };
      const next = { ...state, serial };
      if (event.block)
        return updateBlockItem(
          next,
          event.block.id,
          event.block.index,
          (item) => ({ ...item, edit }),
        );
      const running = lastTurnIndex(state.items, isOpen);
      if (running !== -1)
        return updateTurn(next, (turn) => ({
          ...turn,
          edits: [...turn.edits, edit],
        }));
      return {
        ...next,
        items: [...state.items, { kind: ItemKind.Edit, key: editKey, edit }],
      };
    }
    case CoachEventType.Undone:
      return {
        ...state,
        items: updateEdit(state.items, event.id, (edit) => ({
          ...edit,
          undone: true,
        })),
      };
    case CoachEventType.Question:
      return {
        ...state,
        question: { id: event.id, questions: event.questions },
      };
    case CoachEventType.QuestionClosed:
      return state.question?.id === event.id
        ? { ...state, question: null }
        : state;
    case CoachEventType.Usage:
      return { ...state, usage: event.usage };
    case CoachEventType.Error: {
      const last = state.items.at(-1);
      if (last?.kind === ItemKind.Error && sameError(last.error, event.error)) {
        return {
          ...state,
          items: [
            ...state.items.slice(0, -1),
            { ...last, error: event.error, count: last.count + 1 },
          ],
        };
      }
      const [errorKey, serial] = key(state, "error");
      return {
        ...state,
        serial,
        items: [
          ...state.items,
          { kind: ItemKind.Error, key: errorKey, error: event.error, count: 1 },
        ],
      };
    }
    case CoachEventType.Notice: {
      const [noticeKey, serial] = key(state, "notice");
      return {
        ...state,
        serial,
        items: [
          ...state.items,
          { kind: ItemKind.Notice, key: noticeKey, text: event.text },
        ],
      };
    }
    case CoachEventType.Divider: {
      const [dividerKey, serial] = key(state, "divider");
      return {
        ...state,
        serial,
        items: [
          ...state.items,
          { kind: ItemKind.Divider, key: dividerKey, text: event.text },
        ],
      };
    }
  }
}

export function reduce(state: CoachState, action: Action): CoachState {
  switch (action.type) {
    case ActionType.Event:
      return applyEvent(state, action.event);
    case ActionType.Events:
      return action.events.reduce(applyEvent, state);
    case ActionType.Connection:
      return { ...state, connection: action.connection };
    case ActionType.Send: {
      const [turnKey, serial] = key(state, "turn");
      return {
        ...state,
        serial,
        items: [
          ...state.items,
          newTurn(
            turnKey,
            TurnKind.Ask,
            action.prompt,
            TurnStatus.Sending,
            action.images,
          ),
        ],
      };
    }
    case ActionType.SendFailed: {
      const index = lastTurnIndex(
        state.items,
        (turn) =>
          turn.status === TurnStatus.Sending && turn.prompt === action.prompt,
      );
      if (index === -1) return state;
      const [noticeKey, serial] = key(state, "notice");
      const items = state.items.filter((_, position) => position !== index);
      return {
        ...state,
        serial,
        items: [
          ...items,
          { kind: ItemKind.Notice, key: noticeKey, text: action.message },
        ],
      };
    }
  }
}

export enum MeetingPhase {
  None = "none",
  Live = "live",
  Ended = "ended",
}

export function meetingPhase(state: CoachState): MeetingPhase {
  const strip = state.transcript?.strip;
  if (strip?.state === StripState.Live) return MeetingPhase.Live;
  return strip?.lastTitle ? MeetingPhase.Ended : MeetingPhase.None;
}

export function suggestions(
  phase: MeetingPhase,
  followUpReady = false,
): string[] {
  switch (phase) {
    case MeetingPhase.Live:
      return ["What did they just ask?", "Any promises so far?"];
    case MeetingPhase.Ended:
      return followUpReady
        ? [
            "Make the follow-up shorter",
            "What should I do first?",
            "Make it more formal",
          ]
        : ["Draft a follow-up", "What did we agree on?", "What's still open?"];
    case MeetingPhase.None:
      return ["Help me prepare for a meeting", "Draft an agenda"];
  }
}

export function chipsAllowed(state: CoachState): boolean {
  if (state.wrapUp?.state === WrapUpState.Running) return false;
  return state.items.at(-1)?.kind !== ItemKind.Error;
}

export function isBusy(state: CoachState): boolean {
  return (
    (state.status?.busy ?? false) ||
    state.items.some((item) => item.kind === ItemKind.Turn && isOpen(item))
  );
}

export function lastAsk(state: CoachState): Turn | null {
  const index = lastTurnIndex(state.items, (turn) => turn.ask === TurnKind.Ask);
  const item = index === -1 ? undefined : state.items[index];
  return item?.kind === ItemKind.Turn ? item : null;
}

function editsOf(item: Item): EditView[] {
  if (item.kind === ItemKind.Edit) return [item.edit];
  if (item.kind !== ItemKind.Turn) return [];
  const fromBlocks = item.blocks.flatMap((block) =>
    block.kind === BlockKind.Actions
      ? block.items.flatMap((entry) => (entry.edit ? [entry.edit] : []))
      : [],
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
