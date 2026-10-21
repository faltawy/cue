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

import { CoachStrip } from "./open-button";

function renderButton() {
  return render(
    <TooltipProvider>
      <CoachStrip sessionId="session-1" />
    </TooltipProvider>,
  );
}

describe("CoachStrip", () => {
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
    expect(screen.queryByRole("button", { name: "Coach is listening" }) !== null).toBe(
      shown,
    );
  });

  it("opens the coach without toggling it", () => {
    mocks.sessionMode = "active";
    renderButton();
    fireEvent.click(
      screen.getByRole("button", { name: "Coach is listening" }),
    );
    expect(mocks.show).toHaveBeenCalledTimes(1);
  });
});
