import { commands as dictation, type Phase } from "@anlg/plugin-dictation";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { useDictationStatus } from "./state";

import { DictationPhase } from "~/dictation/controller";

type DictationOverlayState = {
  owner: string;
  phase: Phase;
  amplitude: number;
  preview: string;
};

export function waitForDictationPanel(
  owner: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (useDictationStatus.getState().presentedOwner === owner)
    return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      unsubscribe();
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error("Dictation cancelled"));
    const timeout = setTimeout(
      () =>
        finish(
          new Error("Could not open the dictation panel. Please try again."),
        ),
      5_000,
    );
    const unsubscribe = useDictationStatus.subscribe((state) => {
      if (state.presentedOwner === owner) finish();
    });
    signal.addEventListener("abort", abort, { once: true });
  });
}

export function getDictationOverlayState(
  state: ReturnType<typeof useDictationStatus.getState>,
): DictationOverlayState | null {
  if (state.phase === DictationPhase.Idle || !state.owner) return null;
  return {
    owner: state.owner,
    phase:
      state.phase === DictationPhase.Transcribing ? "processing" : "recording",
    amplitude: state.phase === DictationPhase.Recording ? state.amplitude : 0,
    preview: [state.text, state.partial].filter(Boolean).join(" "),
  };
}

function unwrap(
  result: { status: "ok" } | { status: "error"; error: string },
): void {
  if (result.status === "error") throw new Error(result.error);
}

async function applyDictationOverlay(
  shown: DictationOverlayState | null,
  next: DictationOverlayState | null,
) {
  if (!next) {
    if (shown) unwrap(await dictation.hide());
    return;
  }
  if (!shown || shown.owner !== next.owner) {
    unwrap(await dictation.setPhase(next.phase));
    unwrap(await dictation.setPreview(next.preview));
    unwrap(await dictation.updateAmplitude(next.amplitude));
    unwrap(await dictation.show());
    return;
  }
  if (shown.phase !== next.phase) unwrap(await dictation.setPhase(next.phase));
  if (shown.preview !== next.preview)
    unwrap(await dictation.setPreview(next.preview));
  if (shown.amplitude !== next.amplitude)
    unwrap(await dictation.updateAmplitude(next.amplitude));
}

function isSameOverlay(
  left: DictationOverlayState | null,
  right: DictationOverlayState | null,
) {
  if (!left || !right) return left === right;
  return (
    left.owner === right.owner &&
    left.phase === right.phase &&
    left.amplitude === right.amplitude &&
    left.preview === right.preview
  );
}

/** Applies overlay states one at a time, always skipping to the latest. */
export function createDictationOverlaySynchronizer(
  onPresented: (owner: string | null) => void,
) {
  let desired: DictationOverlayState | null = null;
  let shown: DictationOverlayState | null = null;
  let revision = 0;
  let appliedRevision = 0;
  let running: Promise<void> | null = null;

  const drain = async () => {
    while (appliedRevision < revision) {
      const target = revision;
      const next = desired;
      try {
        await applyDictationOverlay(shown, next);
        shown = next;
        if (target === revision) onPresented(next?.owner ?? null);
      } catch (error) {
        shown = null;
        console.error("Failed to update the dictation overlay:", error);
      }
      appliedRevision = target;
    }
  };

  const schedule = () => {
    if (running) return;
    running = drain().finally(() => {
      running = null;
      if (appliedRevision < revision) schedule();
    });
  };

  return {
    update(state: DictationOverlayState | null) {
      if (isSameOverlay(state, desired)) return;
      desired = state;
      revision += 1;
      schedule();
    },
  };
}

export function DictationOverlay() {
  useMountEffect(() => {
    const synchronizer = createDictationOverlaySynchronizer((owner) => {
      if (useDictationStatus.getState().presentedOwner !== owner)
        useDictationStatus.setState({ presentedOwner: owner });
    });
    const sync = () =>
      synchronizer.update(
        getDictationOverlayState(useDictationStatus.getState()),
      );
    sync();
    const unsubscribe = useDictationStatus.subscribe(sync);
    return () => {
      unsubscribe();
      synchronizer.update(null);
    };
  });
  return null;
}
