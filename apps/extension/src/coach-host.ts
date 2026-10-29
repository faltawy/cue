import { attentionSchema, type Attention } from "@anlg/assistant/attention";
import { CoachEventType } from "@anlg/assistant/protocol";
import { subscribeCoachEvents } from "@anlg/assistant/ui/event-stream";
import {
  AssistantScope,
  AssistantSurface,
  type AssistantHost,
} from "@anlg/assistant/ui/host";

import { ErrorCode } from "./errors";
import { Operation, PanelAction } from "./protocol";

export function createCoachHost(
  generation: string,
  fetcher: typeof fetch = fetch,
  onAttention?: (attention: Attention) => void,
  onConnectionIssue?: (code: ErrorCode | null) => void,
) {
  const lifetime = new AbortController();
  let lastIssue: ErrorCode | null = null;
  const reportIssue = (code: ErrorCode | null) => {
    if (code === lastIssue) return;
    lastIssue = code;
    onConnectionIssue?.(code);
    if (code)
      console.warn("cue_coach_stream_failed", {
        run_id: crypto.randomUUID(),
        code,
      });
  };
  let endpoint: Promise<{ url: string; token: string }> | undefined;
  const connect = () =>
    (endpoint ??= chrome.runtime
      .sendMessage({ action: PanelAction.Coach, generation })
      .then((reply) => {
        if (reply?.kind !== Operation.Coach)
          throw new Error(reply?.error ?? "Coach unavailable");
        const url = new URL(reply.url);
        if (
          url.protocol !== "http:" ||
          url.hostname !== "127.0.0.1" ||
          !url.port ||
          url.username ||
          url.password ||
          url.pathname !== "/browser-coach" ||
          url.search ||
          url.hash
        )
          throw new Error("Invalid coach endpoint");
        if (typeof reply.token !== "string" || reply.token.length < 32)
          throw new Error("Invalid coach credential");
        return { url: url.href, token: reply.token };
      })
      .catch((error) => {
        endpoint = undefined;
        throw error;
      }));
  const request: AssistantHost["request"] = async (path, init) => {
    lifetime.signal.throwIfAborted();
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
      throw new Error("Invalid coach path");
    const current = await connect();
    lifetime.signal.throwIfAborted();
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${current.token}`);
    const signal = init?.signal
      ? AbortSignal.any([lifetime.signal, init.signal])
      : lifetime.signal;
    const response = await fetcher(new URL(`${current.url}${path}`), {
      ...init,
      headers,
      signal,
      redirect: "error",
      credentials: "omit",
    });
    if (path === "/events")
      reportIssue(
        response.ok
          ? null
          : response.status === 409
            ? ErrorCode.CoachMeetingMismatch
            : response.status === 401
              ? ErrorCode.CoachBindingExpired
              : ErrorCode.CoachStreamUnavailable,
      );
    return response;
  };
  const checkedRequest: AssistantHost["request"] = async (path, init) => {
    try {
      return await request(path, init);
    } catch (error) {
      if (
        path === "/events" &&
        !lifetime.signal.aborted &&
        !init?.signal?.aborted
      )
        reportIssue(ErrorCode.CoachStreamUnavailable);
      throw error;
    }
  };
  const host: AssistantHost = {
    scope: AssistantScope.Meeting,
    surface: AssistantSurface.Embedded,
    request: checkedRequest,
    subscribe: (handlers) =>
      subscribeCoachEvents(
        checkedRequest,
        {
          ...handlers,
          error() {
            if (!lifetime.signal.aborted && lastIssue === null)
              reportIssue(ErrorCode.CoachStreamUnavailable);
            handlers.error();
          },
          message(data) {
            try {
              const event = JSON.parse(data);
              if (event.type === CoachEventType.Attention) {
                const parsed = attentionSchema.safeParse(event.attention);
                if (parsed.success && !lifetime.signal.aborted)
                  onAttention?.(parsed.data);
                return;
              }
            } catch {
              /* The shared parser handles malformed stream events. */
            }
            handlers.message(data);
          },
        },
        () => {
          endpoint = undefined;
        },
        lifetime.signal,
      ),
  };
  return {
    host,
    close() {
      lifetime.abort();
      endpoint = undefined;
    },
  };
}
