import { useCallback, useEffect, useMemo, useReducer } from "react";

import { type MeetingCoaching } from "../coaching-preferences";
import { type CoachFeedback, type EvidenceTarget } from "../move";
import { type CoachEvent, CoachEventType } from "../protocol";
import { type PreparedImage } from "./images";
import {
  ActionType,
  type CoachState,
  Connection,
  initialState,
  reduce,
} from "./state";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function post(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<ActionResult> {
  try {
    const response = await fetch(url, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (response.ok) return { ok: true };
    const text = (await response.text()).trim();
    return {
      ok: false,
      message: text || `The coach answered ${response.status}.`,
    };
  } catch {
    return {
      ok: false,
      message: "The coach isn't reachable. It may be restarting.",
    };
  }
}

export type CoachApi = {
  ask(text: string, images?: readonly PreparedImage[]): Promise<ActionResult>;
  checkItem(
    blockId: string,
    index: number,
    checked: boolean,
  ): Promise<ActionResult>;
  addItemToNote(blockId: string, index: number): Promise<ActionResult>;
  open(url: string): Promise<ActionResult>;
  openEvidence(target: EvidenceTarget): Promise<ActionResult>;
  feedback(input: CoachFeedback): Promise<ActionResult>;
  resetFeedback(): Promise<ActionResult>;
  setCoaching(
    input: Partial<MeetingCoaching> & { sessionId: string },
  ): Promise<ActionResult>;
  stop(): Promise<ActionResult>;
  checkIn(): Promise<ActionResult>;
  newChat(): Promise<ActionResult>;
  answer(id: string, answers: string[]): Promise<ActionResult>;
  dismiss(id: string): Promise<ActionResult>;
  undo(editId: string): Promise<ActionResult>;
  chooseSeriesFolder(): Promise<ActionResult>;
  useDefaultFolder(): Promise<ActionResult>;
  addActionItems(): Promise<ActionResult>;
  logToClients(): Promise<ActionResult>;
  signIn(): Promise<ActionResult>;
  chooseProjectFolder(): Promise<ActionResult>;
  retrySetup(): Promise<ActionResult>;
  notify(message: string): void;
};

const EVENT_TYPES: ReadonlySet<string> = new Set<CoachEvent["type"]>([
  CoachEventType.Status,
  CoachEventType.Reset,
  CoachEventType.Divider,
  CoachEventType.User,
  CoachEventType.Text,
  CoachEventType.Tool,
  CoachEventType.ToolResult,
  CoachEventType.Question,
  CoachEventType.QuestionClosed,
  CoachEventType.Usage,
  CoachEventType.Error,
  CoachEventType.Done,
  CoachEventType.Edit,
  CoachEventType.Undone,
  CoachEventType.Notice,
  CoachEventType.Wrapup,
  CoachEventType.Transcript,
  CoachEventType.Block,
  CoachEventType.BlockCheck,
  CoachEventType.Sources,
]);

function isCoachEvent(value: unknown): value is CoachEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    EVENT_TYPES.has(value.type)
  );
}

export function parseEvent(data: string): CoachEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    return isCoachEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export type EventQueue = {
  push(event: CoachEvent): void;
  flush(): void;
  close(): void;
};

export function eventQueue(
  deliver: (events: CoachEvent[]) => void,
  schedule: (run: () => void) => () => void = (run) => {
    const frame = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame);
  },
): EventQueue {
  let pending: CoachEvent[] = [];
  let cancel: (() => void) | null = null;
  const flush = () => {
    cancel = null;
    if (pending.length === 0) return;
    const events = pending;
    pending = [];
    deliver(events);
  };
  return {
    push(event) {
      pending.push(event);
      cancel ??= schedule(flush);
    },
    flush() {
      cancel?.();
      flush();
    },
    close() {
      cancel?.();
      cancel = null;
      pending = [];
    },
  };
}

export const LOST_AFTER_MS = 1_500;

export function useCoach(): [CoachState, CoachApi] {
  const [state, dispatch] = useReducer(reduce, initialState);

  useEffect(() => {
    const source = new EventSource("/events");
    const queue = eventQueue((events) =>
      dispatch({ type: ActionType.Events, events }),
    );
    let lost: ReturnType<typeof setTimeout> | null = null;
    source.onopen = () => {
      if (lost) clearTimeout(lost);
      lost = null;
      dispatch({ type: ActionType.Connection, connection: Connection.Open });
    };
    source.onerror = () => {
      lost ??= setTimeout(
        () =>
          dispatch({
            type: ActionType.Connection,
            connection: Connection.Lost,
          }),
        LOST_AFTER_MS,
      );
    };
    source.onmessage = (message: MessageEvent<string>) => {
      const event = parseEvent(message.data);
      if (event) queue.push(event);
    };
    return () => {
      if (lost) clearTimeout(lost);
      queue.close();
      source.close();
    };
  }, []);

  const notify = useCallback((message: string) => {
    dispatch({
      type: ActionType.Event,
      event: { type: CoachEventType.Notice, text: message },
    });
  }, []);

  const withNotice = useCallback(
    async (run: Promise<ActionResult>) => {
      const result = await run;
      if (!result.ok) notify(result.message);
      return result;
    },
    [notify],
  );

  const ask = useCallback(
    async (text: string, images: readonly PreparedImage[] = []) => {
      dispatch({
        type: ActionType.Send,
        prompt: text,
        images: images.map(({ thumb, width, height }) => ({
          thumb,
          width,
          height,
        })),
      });
      const result = await post(
        "/ask",
        images.length > 0 ? { text, images } : { text },
      );
      if (!result.ok)
        dispatch({
          type: ActionType.SendFailed,
          prompt: text,
          message: result.message,
        });
      return result;
    },
    [],
  );

  const api = useMemo<CoachApi>(
    () => ({
      ask,
      checkItem: (blockId, index, checked) =>
        withNotice(
          post("/blocks/check", { block_id: blockId, index, checked }),
        ),
      addItemToNote: (blockId, index) =>
        withNotice(post("/blocks/action-item", { block_id: blockId, index })),
      open: (url) => withNotice(post("/open", { url })),
      openEvidence: (target) => withNotice(post("/evidence", target)),
      feedback: (input) => withNotice(post("/feedback", input)),
      resetFeedback: () => withNotice(post("/feedback/reset")),
      setCoaching: (input) => post("/coaching", input),
      stop: () => withNotice(post("/stop")),
      checkIn: () => withNotice(post("/checkin")),
      newChat: () => withNotice(post("/new-chat")),
      answer: (id, answers) => withNotice(post("/question", { id, answers })),
      dismiss: (id) => withNotice(post("/question", { id })),
      undo: (editId) => withNotice(post("/undo", { edit_id: editId })),
      chooseSeriesFolder: () => withNotice(post("/project/series")),
      useDefaultFolder: () =>
        withNotice(post("/project/series", undefined, "DELETE")),
      addActionItems: () => withNotice(post("/wrapup/action-items")),
      logToClients: () => withNotice(post("/wrapup/log-clients")),
      signIn: () => withNotice(post("/sign-in")),
      chooseProjectFolder: () => withNotice(post("/project")),
      retrySetup: () => withNotice(post("/setup/retry")),
      notify,
    }),
    [ask, notify, withNotice],
  );
  return [state, api];
}
