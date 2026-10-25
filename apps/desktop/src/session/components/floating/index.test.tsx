import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SessionNoteViewType } from "@anlg/utils/session";

import { FloatingActionButton } from "./index";

import type { Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";
import type { EditorView } from "~/store/zustand/tabs/schema";

describe("FloatingActionButton", () => {
  const tab = {
    type: TabType.Sessions,
    id: "session-1",
    active: true,
    pinned: false,
    slotId: "slot-1",
    state: { view: null, autoStart: null },
  } as Extract<Tab, { type: TabType.Sessions }>;

  afterEach(() => {
    cleanup();
  });

  it("renders only the selection slot, with no chat button", () => {
    render(
      <FloatingActionButton
        currentView={{ type: SessionNoteViewType.Raw } as EditorView}
        tab={tab}
      />,
    );

    const slot = document.querySelector("[data-session-fab-selection]");
    const stack = slot?.parentElement;

    expect(stack?.className).toContain("flex-col-reverse");
    expect(stack?.className).toContain("bottom-3");
    expect(slot?.className).toContain("mb-2");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
