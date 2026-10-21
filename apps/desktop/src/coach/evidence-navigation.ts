import { create } from "zustand";

import { useTabs } from "~/store/zustand/tabs";

export type CoachEvidenceTarget = {
  sessionId: string;
  timestampMs: number;
};

export const useCoachEvidenceTarget = create<{
  target: CoachEvidenceTarget | null;
}>(() => ({ target: null }));

export function openCoachEvidence(target: CoachEvidenceTarget) {
  useCoachEvidenceTarget.setState({ target });
  useTabs.getState().openNew({
    type: "sessions",
    id: target.sessionId,
    state: {
      view: { type: "transcript" },
      autoStart: null,
      scheduledAutoStart: null,
    },
  });
}

export function consumeCoachEvidenceTarget(
  sessionId: string,
): CoachEvidenceTarget | null {
  const target = useCoachEvidenceTarget.getState().target;
  if (target?.sessionId !== sessionId) return null;
  useCoachEvidenceTarget.setState({ target: null });
  return target;
}
