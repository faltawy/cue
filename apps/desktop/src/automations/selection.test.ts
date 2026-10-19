import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({
  storedDraft: undefined as string | undefined,
}));

vi.mock("~/settings/queries", () => ({
  useStoredSettingValue: () => ({
    value: settingsMocks.storedDraft,
    hasValue: Boolean(settingsMocks.storedDraft),
  }),
}));

import {
  useAutomationSelection,
  useEffectiveAutomationSelection,
} from "./selection";

describe("useAutomationSelection", () => {
  beforeEach(() => {
    useAutomationSelection.setState({ selection: null, draftIds: [] });
  });

  it("clears the current selection", () => {
    const { selectStarter, clearSelection } = useAutomationSelection.getState();

    selectStarter("markdown-export");
    clearSelection({ kind: "starter", starterId: "markdown-export" });

    expect(useAutomationSelection.getState().selection).toBeNull();
  });

  it("keeps the current selection when clearing another automation", () => {
    const { selectStarter, clearSelection } = useAutomationSelection.getState();

    selectStarter("markdown-export");
    clearSelection({ kind: "workflow", workflowId: "other-workflow" });

    expect(useAutomationSelection.getState().selection).toEqual({
      kind: "starter",
      starterId: "markdown-export",
    });
  });

  it("creates and selects a visible draft", () => {
    useAutomationSelection.getState().startDraft();

    const { selection, draftIds } = useAutomationSelection.getState();
    expect(draftIds).toHaveLength(1);
    expect(selection).toEqual({ kind: "draft", draftId: draftIds[0] });

    useAutomationSelection.getState().startDraft();

    const next = useAutomationSelection.getState();
    expect(next.draftIds).toHaveLength(2);
    expect(next.selection).toEqual({
      kind: "draft",
      draftId: next.draftIds[0],
    });
  });

  it("removes a draft and falls back to the overview", () => {
    useAutomationSelection.getState().startDraft();
    const draftId = useAutomationSelection.getState().draftIds[0]!;

    useAutomationSelection.getState().removeDraft(draftId);

    const { selection, draftIds } = useAutomationSelection.getState();
    expect(selection).toBeNull();
    expect(draftIds).toHaveLength(0);
  });
});

describe("useEffectiveAutomationSelection", () => {
  beforeEach(() => {
    settingsMocks.storedDraft = undefined;
    useAutomationSelection.setState({ selection: null });
  });

  it("falls back to the stored draft starter", () => {
    settingsMocks.storedDraft = "markdown-export";

    const { result } = renderHook(() => useEffectiveAutomationSelection());

    expect(result.current).toEqual({
      kind: "starter",
      starterId: "markdown-export",
    });
  });

  it("prefers the explicit selection over the stored draft", () => {
    settingsMocks.storedDraft = "markdown-export";
    useAutomationSelection.setState({
      selection: { kind: "draft", draftId: "draft-1" },
    });

    const { result } = renderHook(() => useEffectiveAutomationSelection());

    expect(result.current).toEqual({ kind: "draft", draftId: "draft-1" });
  });

  it("returns null without a selection or a valid stored draft", () => {
    settingsMocks.storedDraft = "not-a-starter";

    const { result } = renderHook(() => useEffectiveAutomationSelection());

    expect(result.current).toBeNull();
  });
});
