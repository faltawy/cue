import { Channel } from "@tauri-apps/api/core";
import { useRef } from "react";

import {
  commands as dictation,
  type RecordingUpdate,
  type CaptureFailure,
} from "@anlg/plugin-dictation";
import { commands as permissions } from "@anlg/plugin-permissions";
import { commands as shortcuts, events } from "@anlg/plugin-shortcut";
import { commands as transcription } from "@anlg/plugin-transcription";
import { toast } from "@anlg/ui/components/ui/toast";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import {
  DictationController,
  DictationError,
  DictationErrorCode,
} from "./controller";
import { waitForDictationPanel } from "./panel";
import { useDictationStatus } from "./state";
import { transcribeDictation } from "./transcribe";

import { DictationPhase } from "~/dictation/controller";
import { useSettingsReady } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import { LiveSessionStatus } from "~/store/zustand/listener/enums";
import { useListener } from "~/stt/contexts";
import { useRunBatch } from "~/stt/useRunBatch";
import { useSTTConnection } from "~/stt/useSTTConnection";
export { useDictationStatus } from "./state";

enum DictationDiagnosticStage {
  ShortcutAccepted = "shortcut_accepted",
  MicrophoneStarted = "microphone_started",
  TargetCaptured = "target_captured",
  PanelPresented = "panel_presented",
  RecordingStopped = "recording_stopped",
  TranscriptionStarted = "transcription_started",
  InsertionStarted = "insertion_started",
  InsertionReturned = "insertion_returned",
  TranscriptionCompleted = "transcription_completed",
  PhaseChanged = "phase_changed",
  ShortcutConfigured = "shortcut_configured",
  CaptureFailed = "capture_failed",
  BatchFallback = "batch_fallback",
}

let lifecycle: Promise<void> = Promise.resolve();

export function waitForDictationCleanup() {
  return lifecycle;
}

export function DictationLifecycle() {
  const settingsReady = useSettingsReady();
  const enabled = useConfigValue("dictation_enabled");
  const shortcut = useConfigValue("dictation_shortcut");
  const handsFree = useConfigValue("dictation_hands_free");
  const capturingShortcut = useDictationStatus(
    (state) => state.capturingShortcut,
  );
  const retry = useDictationStatus((state) => state.retry);
  const meetingActive = useListener(
    (state) =>
      state.live.status !== LiveSessionStatus.Inactive || state.live.loading,
  );

  if (!settingsReady || !enabled) return null;
  return (
    <TranscriptRetention>
      {!meetingActive && !capturingShortcut && (
        <ActiveDictation
          key={`${shortcut}:${handsFree}:${retry}`}
          shortcut={shortcut}
          handsFree={handsFree}
        />
      )}
    </TranscriptRetention>
  );
}

function TranscriptRetention({ children }: { children: React.ReactNode }) {
  useMountEffect(() => () => {
    useDictationStatus.setState({ lastTranscript: "" });
  });
  return children;
}

function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
): T {
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

function ActiveDictation({
  shortcut,
  handsFree,
}: {
  shortcut: string;
  handsFree: boolean;
}) {
  const id = useRef(`system-dictation-${crypto.randomUUID()}`).current;
  const runBatch = useRunBatch(id);
  const stopTranscription = useListener((state) => state.stopTranscription);
  const microphone = useConfigValue("microphone_device");
  const livePreview = useConfigValue("dictation_live_preview");
  const dictionary = useConfigValue("personalization_dictionary_terms");
  const languages = useConfigValue("spoken_languages");
  const { conn } = useSTTConnection();
  const current = useRef({
    runBatch,
    microphone,
    livePreview,
    languages,
    dictionary,
    conn,
  });
  current.current = {
    runBatch,
    microphone,
    livePreview,
    languages,
    dictionary,
    conn,
  };

  useMountEffect(() => {
    let disposed = false;
    let armed = false;
    let target = "";
    let finalTranscript: string | null = null;
    let unlisten: (() => void) | undefined;
    let abort = new AbortController();
    let presentation: Promise<void> = Promise.resolve();
    let runId = id;
    let startedAt = performance.now();
    let lastStage = DictationDiagnosticStage.ShortcutConfigured;
    let captureFailure: CaptureFailure | undefined;
    const record = (
      stage: DictationDiagnosticStage,
      details: Record<string, string | number | boolean> = {},
    ) => {
      lastStage = stage;
      console.info("[dictation]", {
        runId,
        stage,
        elapsedMs: Math.round(performance.now() - startedAt),
        ...details,
      });
    };
    const onError = (error: unknown) => {
      console.error("[dictation] failed", {
        runId,
        phase: useDictationStatus.getState().phase,
        elapsedMs: Math.round(performance.now() - startedAt),
        errorType: error instanceof Error ? error.name : typeof error,
        stage: lastStage,
        captureFailure,
        code: error instanceof DictationError ? error.code : undefined,
      });
      if (disposed) return;
      const message = error instanceof Error ? error.message : String(error);
      useDictationStatus.setState({ error: message });
      toast.error(message);
    };
    const controller = new DictationController({
      handsFree,
      start: async () => {
        abort = new AbortController();
        finalTranscript = null;
        captureFailure = undefined;
        const recordingAbort = abort;
        const owner = `${id}:${crypto.randomUUID()}`;
        runId = owner;
        startedAt = performance.now();
        record(DictationDiagnosticStage.ShortcutAccepted, { handsFree });
        const { microphone, livePreview, conn, languages, dictionary } =
          current.current;
        useDictationStatus.setState({
          owner,
          error: null,
          text: "",
          partial: "",
          amplitude: 0,
        });
        const [permissionResult, captureResult] = await Promise.all([
          permissions.checkPermission("microphone"),
          transcription.getCaptureState(),
        ]);
        const permission = unwrap(permissionResult);
        if (permission !== "authorized")
          throw new Error(
            "Enable microphone permission in Settings > Permissions before dictating.",
          );
        const capture = unwrap(captureResult);
        if (capture !== "inactive")
          throw new Error(
            "Dictation is unavailable while Cue is recording a meeting.",
          );
        abort.signal.throwIfAborted();

        const preview = conn
          ? {
              provider: conn.provider,
              baseUrl: conn.baseUrl,
              apiKey: conn.apiKey,
              params: {
                model: conn.model,
                channels: 1,
                sample_rate: 16000,
                languages: languages || [],
                keywords: dictionary || [],
                num_speakers: 1,
                min_speakers: null,
                max_speakers: null,
                custom_query: null,
              },
            }
          : null;
        abort.signal.throwIfAborted();
        const [targetResult, recordingResult] = await Promise.allSettled([
          dictation.captureTarget(),
          dictation
            .startSystemRecording(
              microphone || null,
              runId,
              preview,
              new Channel<RecordingUpdate>((update) => {
                if (
                  disposed ||
                  recordingAbort.signal.aborted ||
                  recordingAbort !== abort
                )
                  return;
                if (
                  ![DictationPhase.Starting, DictationPhase.Recording].includes(
                    useDictationStatus.getState().phase,
                  )
                )
                  return;
                if (update.type === "captureFailed") {
                  captureFailure = update.reason;
                  record(DictationDiagnosticStage.CaptureFailed, {
                    reason: update.reason,
                  });
                  void controller.release(true);
                  return;
                }
                if (update.type === "amplitude")
                  useDictationStatus.setState({ amplitude: update.amplitude });
                else if (!livePreview) return;
                else if (update.type === "transcript")
                  useDictationStatus.setState({
                    text: update.text,
                    partial: update.partial,
                  });
                else useDictationStatus.setState({ partial: "" });
              }),
            )
            .then((result) => {
              unwrap(result);
              record(DictationDiagnosticStage.MicrophoneStarted);
              return result;
            }),
        ]);
        if (recordingResult.status === "rejected") throw recordingResult.reason;
        unwrap(recordingResult.value);
        try {
          if (targetResult.status === "rejected") throw targetResult.reason;
          target = unwrap(targetResult.value);
          record(DictationDiagnosticStage.TargetCaptured);
          await waitForDictationPanel(owner, abort.signal);
          abort.signal.throwIfAborted();
          record(DictationDiagnosticStage.PanelPresented);
        } catch (error) {
          await dictation.cancelRecording(runId).then(unwrap).catch(onError);
          throw error;
        }
      },
      stop: async () => {
        const recorded = unwrap(await dictation.stopRecording(runId));
        finalTranscript = recorded.transcript ?? null;
        captureFailure = recorded.captureFailure ?? captureFailure;
        record(DictationDiagnosticStage.RecordingStopped, {
          liveTranscriptAvailable: finalTranscript !== null,
        });
        return recorded.filePath;
      },
      cancel: async () => {
        unwrap(await dictation.cancelRecording(runId));
      },
      transcribe: async (path) => {
        record(DictationDiagnosticStage.TranscriptionStarted, {
          live: finalTranscript !== null,
        });
        if (finalTranscript?.trim()) return finalTranscript;
        if (finalTranscript !== null)
          record(DictationDiagnosticStage.BatchFallback, {
            reason: "empty_live_transcript",
          });
        return transcribeDictation(
          current.current.runBatch,
          path,
          abort.signal,
        );
      },
      insert: async (text) => {
        if (captureFailure)
          throw new DictationError(
            DictationErrorCode.CaptureInterrupted,
            "The microphone stopped delivering audio. Recovered text is saved in Settings → Dictation → Last dictation. Check it before pasting, and reconnect or choose another microphone.",
          );
        if (!disposed) {
          record(DictationDiagnosticStage.InsertionStarted, {
            characters: text.length,
          });
          unwrap(await dictation.insertText(target, text));
          record(DictationDiagnosticStage.InsertionReturned);
        }
      },
      discard: async (path) => {
        unwrap(await dictation.discardRecording(path));
      },
      onTranscript: (lastTranscript) => {
        record(DictationDiagnosticStage.TranscriptionCompleted, {
          characters: lastTranscript.length,
        });
        if (!disposed) useDictationStatus.setState({ lastTranscript });
      },
      onError,
      onPhase: (phase) => {
        record(DictationDiagnosticStage.PhaseChanged, { phase });
        if (!disposed)
          useDictationStatus.setState({
            phase,
            ...(phase === DictationPhase.Idle
              ? {
                  owner: null,
                  presentedOwner: null,
                  text: "",
                  partial: "",
                  amplitude: 0,
                }
              : {}),
            ...(phase === DictationPhase.Starting &&
            useDictationStatus.getState().phase === DictationPhase.Idle
              ? { owner: null }
              : {}),
          });
        presentation = presentation
          .then(async () => {
            try {
              unwrap(
                await shortcuts.setActive(
                  phase !== DictationPhase.Idle && !disposed,
                ),
              );
            } catch (error) {
              onError(error);
            }
          })
          .catch(onError);
      },
    });
    const cancel = () => {
      abort.abort();
      void controller.cancel();
      void stopTranscription(id).catch(onError);
    };

    lifecycle = lifecycle
      .then(async () => {
        if (disposed) return;
        unlisten = await events.shortcutEvent.listen(({ payload }) => {
          if (
            disposed ||
            !armed ||
            useDictationStatus.getState().capturingShortcut
          )
            return;
          if (payload.type === "pressed") void controller.press();
          else if (payload.type === "released") void controller.release();
          else cancel();
        });
        if (disposed) {
          unlisten();
          return;
        }
        unwrap(await shortcuts.configure(shortcut));
        armed = !disposed;
        record(DictationDiagnosticStage.ShortcutConfigured, { shortcut });
        if (!disposed)
          useDictationStatus.setState({ ready: true, error: null, cancel });
      })
      .catch(onError);

    return () => {
      disposed = true;
      armed = false;
      unlisten?.();
      cancel();
      useDictationStatus.setState({
        ready: false,
        phase: DictationPhase.Idle,
        lastTranscript: useDictationStatus.getState().lastTranscript,
        cancel: null,
        owner: null,
        text: "",
        partial: "",
      });
      lifecycle = lifecycle
        .then(async () => {
          unlisten?.();
          await controller.cancel();
          await presentation;
          unwrap(await shortcuts.configure(null));
        })
        .catch(() => {});
    };
  });
  return null;
}
