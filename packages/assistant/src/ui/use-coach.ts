import { useCallback, useMemo, useReducer } from "react";

import { type MeetingCoaching } from "../coaching-preferences";
import { type MeetingAction } from "../meeting-actions";
import { type CoachFeedback, type EvidenceTarget } from "../move";
import { type CoachEvent, CoachEventType } from "../protocol";
import { browserHost, useAssistantHost, type AssistantHost } from "./host";
import { type PreparedImage } from "./images";
import {
  ActionType,
  type CoachState,
  Connection,
  initialState,
  reduce,
} from "./state";
import { useMountEffect } from "./use-mount-effect";

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function post(
  url: string,
  body?: unknown,
  method = "POST",
  request: AssistantHost["request"] = browserHost.request,
): Promise<ActionResult> {
  try {
    const response = await request(url, {
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
  ask(
    text: string,
    images?: readonly PreparedImage[],
    action?: MeetingAction,
  ): Promise<ActionResult>;
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
  const host = useAssistantHost();
  const send = useCallback(
    (url: string, body?: unknown, method = "POST") =>
      post(url, body, method, host.request),
    [host],
  );

  useMountEffect(() => {
    const queue = eventQueue((events) =>
      dispatch({ type: ActionType.Events, events }),
    );
    let lost: ReturnType<typeof setTimeout> | null = null;
    const close = host.subscribe({
      open: () => {
        if (lost) clearTimeout(lost);
        lost = null;
        dispatch({ type: ActionType.Connection, connection: Connection.Open });
      },
      error: () => {
        lost ??= setTimeout(
          () =>
            dispatch({
              type: ActionType.Connection,
              connection: Connection.Lost,
            }),
          LOST_AFTER_MS,
        );
      },
      message: (data) => {
        const event = parseEvent(data);
        if (event) queue.push(event);
      },
    });
    return () => {
      if (lost) clearTimeout(lost);
      queue.close();
      close();
    };
  });

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
    async (
      text: string,
      images: readonly PreparedImage[] = [],
      action?: MeetingAction,
    ) => {
      dispatch({
        type: ActionType.Send,
        prompt: text,
        images: images.map(({ thumb, width, height }) => ({
          thumb,
          width,
          height,
        })),
      });
      const result = await send("/ask", {
        text,
        ...(images.length > 0 ? { images } : {}),
        ...(action ? { action } : {}),
      });
      if (!result.ok)
        dispatch({
          type: ActionType.SendFailed,
          prompt: text,
          message: result.message,
        });
      return result;
    },
    [send],
  );

  const api = useMemo<CoachApi>(
    () => ({
      ask,
      checkItem: (blockId, index, checked) =>
        withNotice(
          send("/blocks/check", { block_id: blockId, index, checked }),
        ),
      addItemToNote: (blockId, index) =>
        withNotice(send("/blocks/action-item", { block_id: blockId, index })),
      open: (url) => withNotice(send("/open", { url })),
      openEvidence: (target) => withNotice(send("/evidence", target)),
      feedback: (input) => withNotice(send("/feedback", input)),
      resetFeedback: () => withNotice(send("/feedback/reset")),
      setCoaching: (input) => send("/coaching", input),
      stop: () => withNotice(send("/stop")),
      checkIn: () => withNotice(send("/checkin")),
      newChat: () => withNotice(send("/new-chat")),
      answer: (id, answers) => withNotice(send("/question", { id, answers })),
      dismiss: (id) => withNotice(send("/question", { id })),
      undo: (editId) => withNotice(send("/undo", { edit_id: editId })),
      chooseSeriesFolder: () => withNotice(send("/project/series")),
      useDefaultFolder: () =>
        withNotice(send("/project/series", undefined, "DELETE")),
      addActionItems: () => withNotice(send("/wrapup/action-items")),
      logToClients: () => withNotice(send("/wrapup/log-clients")),
      signIn: () => withNotice(send("/sign-in")),
      chooseProjectFolder: () => withNotice(send("/project")),
      retrySetup: () => withNotice(send("/setup/retry")),
      notify,
    }),
    [ask, notify, withNotice, send],
  );
  return [state, api];
}
