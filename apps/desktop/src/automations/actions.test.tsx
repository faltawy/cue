import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearSelection: vi.fn(),
  setSettingValues: vi.fn(() => Promise.resolve()),
  setSettingValue: vi.fn<(key: string, value: string) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  storedValues: {} as Record<string, string>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("./selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({ clearSelection: mocks.clearSelection }),
}));

vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: () =>
    Promise.resolve({
      values: mocks.storedValues,
      hasValues: new Set(Object.keys(mocks.storedValues)),
    }),
  setSettingValues: mocks.setSettingValues,
  setSettingValue: mocks.setSettingValue,
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import { useDeleteWorkflow, useRemoveStarterDraft } from "./actions";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useRemoveStarterDraft", () => {
  beforeEach(() => {
    mocks.clearSelection.mockClear();
    mocks.setSettingValues.mockClear();
    mocks.storedValues = {};
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
  });

  it("disables the starter and clears its stored draft", async () => {
    mocks.storedValues = { automation_draft_template: "markdown-export" };

    const { result } = renderHook(() => useRemoveStarterDraft(), { wrapper });
    result.current.mutate("markdown-export");

    await waitFor(() => {
      expect(mocks.setSettingValues).toHaveBeenCalledWith({
        automation_markdown_export_enabled: false,
        automation_draft_template: "",
      });
    });
    expect(mocks.clearSelection).toHaveBeenCalledWith({
      kind: "starter",
      starterId: "markdown-export",
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Automation removed");
  });

  it("keeps a stored draft that belongs to another automation", async () => {
    mocks.storedValues = { automation_draft_template: "slack-recap" };

    const { result } = renderHook(() => useRemoveStarterDraft(), { wrapper });
    result.current.mutate("markdown-export");

    await waitFor(() => {
      expect(mocks.setSettingValues).toHaveBeenCalledWith({
        automation_markdown_export_enabled: false,
      });
    });
  });
});

describe("useDeleteWorkflow", () => {
  beforeEach(() => {
    mocks.clearSelection.mockClear();
    mocks.setSettingValue.mockClear();
    mocks.toastSuccess.mockClear();
  });

  it("deletes only the chosen workflow and clears its selection", async () => {
    mocks.storedValues = {
      automation_workflows: JSON.stringify([
        { id: "wf-1", title: "Recap", steps: [] },
        { id: "wf-2", title: "Export", steps: [] },
      ]),
    };
    const { result } = renderHook(() => useDeleteWorkflow(), { wrapper });
    result.current.mutate("wf-1");

    await waitFor(() => {
      expect(mocks.clearSelection).toHaveBeenCalledWith({
        kind: "workflow",
        workflowId: "wf-1",
      });
    });
    const [key, saved] = mocks.setSettingValue.mock.calls[0] ?? [];
    expect(key).toBe("automation_workflows");
    expect(
      JSON.parse(String(saved)).map((workflow: { id: string }) => workflow.id),
    ).toEqual(["wf-2"]);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Automation deleted");
  });
});
