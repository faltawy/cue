import { useMemo, useRef, useState } from "react";

import { DictationAction } from "../app-bridge";
import { useAssistantHost, type AssistantHost } from "./host";

export enum DictationPhase {
  Idle = "idle",
  Listening = "listening",
  Transcribing = "transcribing",
}

async function request(
  fetch: AssistantHost["request"],
  recordingId: string,
  action: DictationAction,
) {
  const response = await fetch("/dictation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recording_id: recordingId, action }),
    keepalive: action === DictationAction.Cancel,
  });
  if (!response.ok)
    throw new Error(
      (await response.text()).trim() || "Dictation failed. Try again.",
    );
  const result: unknown = await response.json();
  if (
    !result ||
    typeof result !== "object" ||
    !("text" in result) ||
    (result.text !== null && typeof result.text !== "string")
  ) {
    throw new Error("The app returned an invalid dictation response.");
  }
  return result.text;
}

export function useDictation(owner: number, onText: (text: string) => void) {
  const host = useAssistantHost();
  const [state, setState] = useState<{
    phase: DictationPhase;
    error: string | null;
  }>({ phase: DictationPhase.Idle, error: null });
  const append = useRef(onText);
  append.current = onText;
  const control = useMemo(() => {
    let mounted = false;
    let active: {
      id: string;
      phase: DictationPhase;
      started: Promise<string | null>;
      timer: ReturnType<typeof setTimeout>;
    } | null = null;
    const publish = (phase: DictationPhase, error: string | null = null) => {
      if (mounted) setState({ phase, error });
    };
    const discard = (id: string) => {
      void request(host.request, id, DictationAction.Cancel).catch(() => {});
    };
    const cancel = () => {
      const current = active;
      if (!current) return;
      active = null;
      clearTimeout(current.timer);
      publish(DictationPhase.Idle);
      discard(current.id);
      // Cancellation can reach the host before its pending start request.
      void current.started.then(
        () => discard(current.id),
        () => {},
      );
    };
    const stop = async () => {
      const current = active;
      if (!current || current.phase !== DictationPhase.Listening) return;
      current.phase = DictationPhase.Transcribing;
      clearTimeout(current.timer);
      publish(DictationPhase.Transcribing);
      try {
        await current.started;
        if (active !== current) return;
        const text = (
          await request(host.request, current.id, DictationAction.Stop)
        )?.trim();
        if (active !== current) return;
        active = null;
        publish(
          DictationPhase.Idle,
          text
            ? null
            : "No speech was recognized. Click the microphone and speak, then click again to finish.",
        );
        if (text && mounted) append.current(text);
      } catch (error) {
        if (active !== current) return;
        cancel();
        publish(
          DictationPhase.Idle,
          error instanceof Error
            ? error.message
            : "Dictation failed. Try again.",
        );
      }
    };
    const start = () => {
      if (active || !mounted) return;
      const id = crypto.randomUUID();
      const current = {
        id,
        phase: DictationPhase.Listening,
        started: request(host.request, id, DictationAction.Start),
        timer: setTimeout(() => {
          void stop();
        }, 60_000),
      };
      active = current;
      publish(DictationPhase.Listening);
      void current.started.catch((error: unknown) => {
        if (active !== current) return;
        cancel();
        publish(
          DictationPhase.Idle,
          error instanceof Error ? error.message : "Could not start dictation.",
        );
      });
    };
    const lifecycle = (element: HTMLDivElement | null) => {
      if (!element) return;
      mounted = true;
      publish(DictationPhase.Idle);
      const escape = (event: KeyboardEvent) => {
        if (event.key !== "Escape" || !active) return;
        event.preventDefault();
        event.stopPropagation();
        cancel();
      };
      const hidden = () => {
        if (document.hidden) cancel();
      };
      window.addEventListener("keydown", escape, true);
      window.addEventListener("pagehide", cancel);
      document.addEventListener("visibilitychange", hidden);
      return () => {
        mounted = false;
        cancel();
        window.removeEventListener("keydown", escape, true);
        window.removeEventListener("pagehide", cancel);
        document.removeEventListener("visibilitychange", hidden);
      };
    };
    return {
      toggle: () => {
        if (active) void stop();
        else start();
      },
      cancel,
      lifecycle,
      isListening: () => active?.phase === DictationPhase.Listening,
    };
  }, [owner, host]);
  return { ...control, ...state };
}
