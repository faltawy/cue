import { create } from "zustand";

import { isStarterId, type StarterId } from "./starters";

import { useStoredSettingValue } from "~/settings/queries";
import { id } from "~/shared/utils";

export type AutomationSelection =
  | { kind: "starter"; starterId: StarterId }
  | { kind: "draft"; draftId: string }
  | { kind: "workflow"; workflowId: string };

interface AutomationSelectionState {
  selection: AutomationSelection | null;
  draftIds: string[];
  selectStarter: (starterId: StarterId) => void;
  selectDraft: (draftId: string) => void;
  selectWorkflow: (workflowId: string) => void;
  startDraft: () => void;
  removeDraft: (draftId: string) => void;
  clearSelection: (selection: AutomationSelection) => void;
}

function selectionKey(selection: AutomationSelection): string {
  switch (selection.kind) {
    case "starter":
      return `starter:${selection.starterId}`;
    case "draft":
      return `draft:${selection.draftId}`;
    case "workflow":
      return `workflow:${selection.workflowId}`;
  }
}

export const useAutomationSelection = create<AutomationSelectionState>(
  (set, get) => {
    const clearSelection = (selection: AutomationSelection) => {
      const { selection: current } = get();
      if (current && selectionKey(current) === selectionKey(selection)) {
        set({ selection: null });
      }
    };

    return {
      selection: null,
      draftIds: [],
      selectStarter: (starterId) =>
        set({ selection: { kind: "starter", starterId } }),
      selectDraft: (draftId) => set({ selection: { kind: "draft", draftId } }),
      selectWorkflow: (workflowId) =>
        set({ selection: { kind: "workflow", workflowId } }),
      startDraft: () => {
        const draftId = id();
        set((state) => ({
          selection: { kind: "draft", draftId },
          draftIds: [draftId, ...state.draftIds],
        }));
      },
      removeDraft: (draftId) => {
        set((state) => ({
          draftIds: state.draftIds.filter((item) => item !== draftId),
        }));
        clearSelection({ kind: "draft", draftId });
      },
      clearSelection,
    };
  },
);

export function useEffectiveAutomationSelection(): AutomationSelection | null {
  const selection = useAutomationSelection((state) => state.selection);
  const storedDraft = useStoredSettingValue("automation_draft_template");

  if (selection) {
    return selection;
  }

  return isStarterId(storedDraft.value)
    ? { kind: "starter", starterId: storedDraft.value }
    : null;
}
