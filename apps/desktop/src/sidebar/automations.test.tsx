import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render as renderTesting,
  screen,
} from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@iconify-icon/react", () => ({
  Icon: (props: Record<string, unknown>) =>
    createElement("iconify-icon", props),
}));

type ContextMenuItem =
  | { id: string; text: string; action: () => void }
  | { separator: true };

const mocks = vi.hoisted(() => ({
  contextMenus: [] as Array<
    Array<{ id: string; text: string; action: () => void }>
  >,
  deleteWorkflow: vi.fn(),
  draftIds: [] as string[],
  removeDraft: vi.fn(),
  removeStarterDraft: vi.fn(),
  selection: null as unknown,
  selectStarter: vi.fn(),
  selectDraft: vi.fn(),
  selectWorkflow: vi.fn(),
  startDraft: vi.fn(),
  saveAutomationWorkflows: vi.fn<
    (workflows: Array<{ id: string }>) => Promise<void>
  >(() => Promise.resolve()),
  showContextMenu: vi.fn(),
  workflows: [] as Array<{
    id: string;
    title: string;
    enabled: boolean;
    trigger: string;
    steps: unknown[];
    lastRun: null;
    processedSessionIds: string[];
  }>,
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
    saveAutomationWorkflows: mocks.saveAutomationWorkflows,
    mutateAutomationWorkflows: async (
      update: (workflows: typeof mocks.workflows) => typeof mocks.workflows,
    ) => {
      await mocks.saveAutomationWorkflows(update(mocks.workflows));
    },
  };
});

vi.mock("~/automations/selection", () => ({
  useAutomationSelection: (selector: (state: unknown) => unknown) =>
    selector({
      draftIds: mocks.draftIds,
      selectStarter: mocks.selectStarter,
      selectDraft: mocks.selectDraft,
      selectWorkflow: mocks.selectWorkflow,
      startDraft: mocks.startDraft,
      removeDraft: mocks.removeDraft,
    }),
  useEffectiveAutomationSelection: () => mocks.selection,
}));

vi.mock("~/shared/hooks/useNativeContextMenu", () => ({
  useNativeContextMenu: (items: ContextMenuItem[]) => {
    mocks.contextMenus.push(
      items.filter(
        (item): item is Exclude<ContextMenuItem, { separator: true }> =>
          !("separator" in item),
      ),
    );
    return mocks.showContextMenu;
  },
}));

vi.mock("~/sidebar/custom-sidebar-header", () => ({
  CustomSidebarHeader: ({ children }: { children?: React.ReactNode }) => (
    <header>{children}</header>
  ),
}));

import { AutomationsNav } from "./automations";

function render(ui: React.ReactElement) {
  return renderTesting(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      {ui}
    </QueryClientProvider>,
  );
}

function findContextMenuItem(id: string) {
  for (const items of mocks.contextMenus) {
    const match = items.find((item) => item.id === id);
    if (match) {
      return match;
    }
  }
  return undefined;
}

describe("AutomationsNav", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.workflows = [
      savedWorkflow("wf-1", "Share weekly recap"),
      savedWorkflow("wf-2", "Update project notes"),
    ];
    mocks.contextMenus = [];
    mocks.draftIds = [];
    mocks.selection = { kind: "workflow", workflowId: "wf-1" };
    mocks.deleteWorkflow.mockClear();
    mocks.removeDraft.mockClear();
    mocks.removeStarterDraft.mockClear();
    mocks.selectStarter.mockClear();
    mocks.selectDraft.mockClear();
    mocks.selectWorkflow.mockClear();
    mocks.startDraft.mockClear();
    mocks.saveAutomationWorkflows.mockClear();
    mocks.showContextMenu.mockClear();
  });

  it("lists the starter automations and selects one", () => {
    render(<AutomationsNav />);

    expect(screen.getByText("Get started")).toBeTruthy();
    expect(screen.getByText("Export every meeting as Markdown")).toBeTruthy();
    expect(screen.queryByText("Share a meeting recap in Slack")).toBeNull();
    expect(screen.queryByText("Save meetings to Google Drive")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Export every meeting as Markdown/ }),
    );

    expect(mocks.selectStarter).toHaveBeenCalledWith("markdown-export");
  });

  it("lists saved automations and opens the chosen one", () => {
    render(<AutomationsNav />);

    expect(screen.getByText("My automations")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /Share weekly recap/ })
        .getAttribute("aria-current"),
    ).toBe("page");

    const workflowButton = screen
      .getByText("Update project notes")
      .closest("button");
    expect(workflowButton).toBeTruthy();
    fireEvent.click(workflowButton!);

    expect(mocks.selectWorkflow).toHaveBeenCalledWith("wf-2");
  });

  it("offers edit and remove in the starter context menu", () => {
    render(<AutomationsNav />);

    fireEvent.contextMenu(
      screen.getByRole("button", { name: /Export every meeting as Markdown/ }),
    );

    expect(mocks.selectStarter).toHaveBeenCalledWith("markdown-export");
    expect(mocks.showContextMenu).toHaveBeenCalled();

    findContextMenuItem("remove-automation-markdown-export")?.action();
    expect(mocks.removeStarterDraft).toHaveBeenCalledWith("markdown-export");
  });

  it("offers edit and delete in the saved automation context menu", () => {
    render(<AutomationsNav />);

    const workflowButton = screen
      .getByText("Update project notes")
      .closest("button");
    fireEvent.contextMenu(workflowButton!);

    expect(mocks.selectWorkflow).toHaveBeenCalledWith("wf-2");
    expect(mocks.showContextMenu).toHaveBeenCalled();

    findContextMenuItem("delete-automation-wf-2")?.action();
    expect(mocks.deleteWorkflow).toHaveBeenCalledWith("wf-2");
  });

  it("filters starters and saved automations together", () => {
    render(<AutomationsNav />);

    fireEvent.change(screen.getByPlaceholderText("Search automations..."), {
      target: { value: "project" },
    });

    expect(screen.queryByText("Export every meeting as Markdown")).toBeNull();
    expect(screen.queryByText("Share weekly recap")).toBeNull();
    expect(screen.getByText("Update project notes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(screen.getByText("Share weekly recap")).toBeTruthy();
    expect(screen.getByText("Export every meeting as Markdown")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search automations..."), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No automations match “zzz”")).toBeTruthy();
  });

  it("starts a new automation workflow from the sidebar", async () => {
    mocks.workflows = [];
    render(<AutomationsNav />);

    fireEvent.click(screen.getByRole("button", { name: "New automation" }));

    expect(mocks.saveAutomationWorkflows).toHaveBeenCalledOnce();
    const saved = mocks.saveAutomationWorkflows.mock.calls[0]?.[0];
    expect(saved).toHaveLength(1);
    await vi.waitFor(() => {
      expect(mocks.selectWorkflow).toHaveBeenCalledWith(saved[0]?.id);
    });
  });

  it("shows drafts as untitled automations and selects them", () => {
    mocks.draftIds = ["draft-1"];
    mocks.selection = { kind: "draft", draftId: "draft-1" };

    render(<AutomationsNav />);

    const draftButton = screen
      .getByText("Untitled automation")
      .closest("button");
    expect(draftButton).toBeTruthy();
    expect(draftButton!.getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Draft")).toBeTruthy();

    fireEvent.click(draftButton!);

    expect(mocks.selectDraft).toHaveBeenCalledWith("draft-1");
  });

  it("offers delete in the draft context menu", () => {
    mocks.draftIds = ["draft-1"];

    render(<AutomationsNav />);

    fireEvent.contextMenu(
      screen.getByText("Untitled automation").closest("button")!,
    );

    expect(mocks.selectDraft).toHaveBeenCalledWith("draft-1");
    expect(mocks.showContextMenu).toHaveBeenCalled();

    findContextMenuItem("delete-automation-draft-1")?.action();
    expect(mocks.removeDraft).toHaveBeenCalledWith("draft-1");
  });
});

function savedWorkflow(id: string, title: string) {
  return {
    id,
    title,
    enabled: true,
    trigger: "meeting_completed",
    steps: [],
    lastRun: null,
    processedSessionIds: [],
  };
}
