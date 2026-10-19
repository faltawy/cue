import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

import { ShortcutHint } from "./shortcut-hint";

function hover(element: HTMLElement) {
  fireEvent.pointerMove(element, { pointerType: "mouse" });
}

function leave(element: HTMLElement) {
  fireEvent.pointerLeave(element, { pointerType: "mouse" });
}

describe("ShortcutHint", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the next button's hint at once after one hint was open, like a toolbar", () => {
    vi.useFakeTimers();
    render(
      <TooltipProvider>
        <ShortcutHint label="Search">
          <button type="button">search</button>
        </ShortcutHint>
        <ShortcutHint label="New note">
          <button type="button">new</button>
        </ShortcutHint>
      </TooltipProvider>,
    );

    const search = screen.getByRole("button", { name: "search" });
    hover(search);
    act(() => vi.advanceTimersByTime(600));
    expect(screen.getAllByText("Search").length).toBeGreaterThan(0);

    leave(search);
    fireEvent.pointerMove(document, { clientX: 500, clientY: 500 });
    hover(screen.getByRole("button", { name: "new" }));
    act(() => vi.advanceTimersByTime(50));

    expect(screen.queryAllByText("New note").length).toBeGreaterThan(0);
  });
});
