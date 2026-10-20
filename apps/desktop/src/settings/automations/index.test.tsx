import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The real iconify-icon web component renders asynchronously via timers that
// can fire after the test environment is torn down ("document is not
// defined" unhandled errors), so render an inert element instead.
vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

const mocks = vi.hoisted(() => ({
  deleteWorkflow: vi.fn(),
  removeDraft: vi.fn(),
  removeStarterDraft: vi.fn(),
  selection: null as unknown,
  setSettingValue: vi.fn<(...args: unknown[]) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  workflows: [] as Array<{
    id: string;
    title: string;
    enabled: boolean;
    trigger: string;
    steps: unknown[];
    lastRun: null;
    processedSessionIds: string[];
  }>,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  settingValues: {} as Record<string, unknown>,
  storedWorkflows: "[]",
  testStarterMarkdownExport: vi.fn(),
}));

vi.mock("~/automations/engine", () => ({
  testStarterMarkdownExport: mocks.testStarterMarkdownExport,
}));

vi.mock("~/automations/actions", () => ({
  useRemoveStarterDraft: () => ({ mutate: mocks.removeStarterDraft }),
  useDeleteWorkflow: () => ({ mutate: mocks.deleteWorkflow }),
}));

vi.mock("~/automations/workflows", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/automations/workflows")>();
  return {
    ...actual,
    useAutomationWorkflows: () => mocks.workflows,
    saveAutomationWorkflows: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("~/automations/selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({ removeDraft: mocks.removeDraft }),
  useEffectiveAutomationSelection: () => mocks.selection,
}));

vi.mock("~/settings/queries", () => ({
  setSettingValue: mocks.setSettingValue,
  setSettingValues: mocks.setSettingValue,
  getStoredSettingValues: () =>
    Promise.resolve({
      values: { automation_workflows: mocks.storedWorkflows },
      hasValues: new Set(["automation_workflows"]),
    }),
  useStoredSettingValue: () => ({ value: "", hasValue: false }),
  useStoredSettingValues: () => ({
    values: mocks.settingValues,
    hasValues: new Set(Object.keys(mocks.settingValues)),
  }),
}));

vi.mock("./starter-config", () => ({
  AutomationLastRunLine: () => null,
  MarkdownExportConfig: () => <div data-testid="config-markdown" />,
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
  },
}));

import { AutomationsContent } from ".";

function lastSaved(key: string) {
  const calls = mocks.setSettingValue.mock.calls.filter(
    (call) => call[0] === key,
  );
  return JSON.parse(String(calls[calls.length - 1]?.[1]));
}

function renderAutomations() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AutomationsContent />
    </QueryClientProvider>,
  );
}

describe("AutomationsContent", () => {
  // Radix's focus scope schedules a focus dispatch on unmount, so drain the
  // timer queue while jsdom is still alive; left pending it fires against a
  // torn-down realm and vitest reports an unhandled error.
  afterEach(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  beforeEach(() => {
    mocks.deleteWorkflow.mockClear();
    mocks.removeDraft.mockClear();
    mocks.removeStarterDraft.mockClear();
    mocks.selection = null;
    mocks.workflows = [];
    mocks.setSettingValue.mockClear();
    mocks.toastError.mockClear();
    mocks.toastSuccess.mockClear();
    mocks.toastWarning.mockClear();
    mocks.settingValues = {};
    mocks.storedWorkflows = "[]";
    mocks.testStarterMarkdownExport.mockReset();
  });

  it("shows the overview when nothing is selected", () => {
    renderAutomations();

    expect(screen.getByRole("heading", { name: "Automations" })).toBeTruthy();
    expect(screen.getByText("No automation draft yet")).toBeTruthy();
    expect(
      screen.getByText(
        "Choose a starter from the sidebar, or create a workflow and add steps like Zapier.",
      ),
    ).toBeTruthy();
  });

  it("shows the untitled draft page after the sidebar plus button", () => {
    mocks.selection = { kind: "draft", draftId: "draft-1" };

    renderAutomations();

    expect(
      screen.getByRole<HTMLInputElement>("textbox", { name: "Automation name" })
        .placeholder,
    ).toBe("Untitled automation");
    expect(
      screen.getByText("Add a trigger, then stack actions like Zapier."),
    ).toBeTruthy();
    expect(screen.getByText("Add an action")).toBeTruthy();
  });

  it("deletes a draft from its actions menu", async () => {
    mocks.selection = { kind: "draft", draftId: "draft-1" };

    renderAutomations();

    const trigger = screen.getByRole("button", { name: "Automation actions" });
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByText("Delete automation"));

    expect(mocks.removeDraft).toHaveBeenCalledWith("draft-1");
  });

  it("shows the selected starter as an inspectable deterministic draft", () => {
    mocks.selection = { kind: "starter", starterId: "markdown-export" };

    renderAutomations();

    expect(screen.getByTestId("config-markdown")).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Test" }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>("button", {
        name: "Save & enable",
      }).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByText("Expected output")).toBeTruthy();
  });

  it.each([
    {
      name: "draft",
      selection: { kind: "draft", draftId: "draft-1" },
      menuItem: "Delete automation",
      mock: mocks.removeDraft,
      id: "draft-1",
    },
    {
      name: "starter automation",
      selection: { kind: "starter", starterId: "markdown-export" },
      menuItem: "Remove automation",
      mock: mocks.removeStarterDraft,
      id: "markdown-export",
    },
    {
      name: "saved workflow",
      selection: { kind: "workflow", workflowId: "wf-1" },
      menuItem: "Delete automation",
      mock: mocks.deleteWorkflow,
      id: "wf-1",
    },
  ])(
    "deletes a $name from its actions menu",
    async ({ selection, menuItem, mock, id }) => {
      mocks.selection = selection;

      renderAutomations();

      const trigger = screen.getByRole("button", {
        name: "Automation actions",
      });
      fireEvent.pointerDown(trigger);
      fireEvent.click(trigger);

      fireEvent.click(await screen.findByText(menuItem));

      expect(mock).toHaveBeenCalledWith(id);
    },
  );

  it("saves the selected draft without a plan prompt", async () => {
    mocks.selection = { kind: "starter", starterId: "markdown-export" };

    renderAutomations();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(mocks.setSettingValue).toHaveBeenCalledWith(
        "automation_draft_template",
        "markdown-export",
      );
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Automation draft saved");
    expect(mocks.toastWarning).not.toHaveBeenCalled();
  });
  it("renames a workflow from its header", async () => {
    const workflow = {
      id: "wf-1",
      title: "",
      enabled: false,
      trigger: "note_enhanced",
      steps: [],
      lastRun: null,
      processedSessionIds: [],
    };
    mocks.workflows = [workflow];
    mocks.storedWorkflows = JSON.stringify([workflow]);
    mocks.selection = { kind: "workflow", workflowId: "wf-1" };
    renderAutomations();

    const name = screen.getByRole("textbox", { name: "Automation name" });
    name.focus();
    fireEvent.change(name, { target: { value: "  Weekly export " } });
    fireEvent.keyDown(name, { key: "Enter" });

    await waitFor(() => {
      expect(lastSaved("automation_workflows")).toMatchObject([
        { id: "wf-1", title: "Weekly export" },
      ]);
    });
  });

  it("test-runs the starter export once a folder is chosen", async () => {
    mocks.settingValues = {
      automation_markdown_export_directory: "/exports",
    };
    mocks.testStarterMarkdownExport.mockResolvedValue({
      at: "2026-10-20T10:00:00.000Z",
      status: "success",
      detail: "/exports/2026-10-20 Standup.md",
    });
    mocks.selection = { kind: "starter", starterId: "markdown-export" };
    renderAutomations();

    fireEvent.click(screen.getByRole("button", { name: "Test" }));

    await waitFor(() => {
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Test export saved to /exports/2026-10-20 Standup.md",
      );
    });
  });

  it("saves which sections the starter exports", async () => {
    mocks.selection = { kind: "starter", starterId: "markdown-export" };
    renderAutomations();

    fireEvent.click(screen.getByRole("checkbox", { name: "Transcript" }));

    await waitFor(() => {
      expect(lastSaved("automation_markdown_export_options")).toMatchObject({
        include_memo: true,
        include_transcript: false,
      });
    });
  });
});
