import { create } from "zustand";

import { DictationPhase } from "./controller";

export const useDictationStatus = create<{
  capturingShortcut: boolean;
  phase: DictationPhase;
  error: string | null;
  lastTranscript: string;
  ready: boolean;
  retry: number;
  owner: string | null;
  presentedOwner: string | null;
  amplitude: number;
  text: string;
  partial: string;
  cancel: (() => void) | null;
}>(() => ({
  capturingShortcut: false,
  phase: DictationPhase.Idle,
  error: null,
  lastTranscript: "",
  ready: false,
  retry: 0,
  owner: null,
  presentedOwner: null,
  amplitude: 0,
  text: "",
  partial: "",
  cancel: null,
}));
