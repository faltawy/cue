import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  sessionMode: "inactive",
  show: vi.fn(async () => ({ status: "ok" as const, data: null })),
}));

vi.mock("@anlg/plugin-coach", () => ({
  commands: { show: mocks.show },
}));
vi.mock("~/shared/config", () => ({
  useConfigValue: () => "Super+Shift+KeyK",
}));
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ getSessionMode: () => mocks.sessionMode }),
}));

import { CoachButton } from "./open-button";

function renderButton() {
  return render(
    <TooltipProvider>
      <CoachButton sessionId="session-1" />
    </TooltipProvider>,
  );
}

describe("CoachButton", () => {
  afterEach(() => {
    cleanup();
    mocks.show.mockClear();
  });

  it.each([
    ["inactive", false],
    ["active", true],
    ["finalizing", true],
    ["running_batch", false],
  ])("in %s mode, shown is %s", (mode, shown) => {
    mocks.sessionMode = mode;
    renderButton();
    expect(screen.queryByRole("button", { name: "Open coach" }) !== null).toBe(
      shown,
    );
  });

  it("opens the coach without toggling it", () => {
    mocks.sessionMode = "active";
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Open coach" }));
    expect(mocks.show).toHaveBeenCalledTimes(1);
  });
});
