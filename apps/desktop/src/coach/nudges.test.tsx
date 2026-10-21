import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TooltipProvider } from "@anlg/ui/components/ui/tooltip";

type Listener = (event: { payload: unknown }) => void;

const mocks = vi.hoisted(() => ({
  listeners: {} as Record<string, Listener>,
  stored: {} as Record<string, boolean>,
  show: vi.fn(async () => ({ status: "ok" as const, data: null })),
  showNotification: vi.fn(async () => ({ status: "ok" as const, data: null })),
}));

function listenAs(name: string) {
  return {
    listen: async (listener: Listener) => {
      mocks.listeners[name] = listener;
      return () => delete mocks.listeners[name];
    },
  };
}

vi.mock("@anlg/plugin-coach", () => ({
  commands: { show: mocks.show },
  events: {
    coachNudged: listenAs("nudged"),
    coachFocused: listenAs("focused"),
  },
}));
vi.mock("@anlg/plugin-notification", () => ({
  commands: { showNotification: mocks.showNotification },
  events: { notificationEvent: listenAs("notification") },
}));
vi.mock("~/settings/queries", () => ({
  getStoredSettingValues: async () => ({
    values: mocks.stored,
    hasValues: new Set(Object.keys(mocks.stored)),
  }),
}));
vi.mock("~/shared/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/shared/config")>()),
  useConfigValue: () => "Super+Shift+KeyK",
}));
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({ getSessionMode: () => "active" }),
}));

import { CoachNudgeLifecycle, useCoachNudges } from "./nudges";
import { CoachStrip } from "./open-button";

function renderNote() {
  return render(
    <TooltipProvider>
      <CoachNudgeLifecycle />
      <CoachStrip sessionId="session-1" />
    </TooltipProvider>,
  );
}

const nudge = {
  session_id: "session-1",
  tag: "open_question",
  line: "We can ship the export by Friday.",
};

describe("nudges while the coach is out of view", () => {
  beforeEach(() => {
    mocks.stored = {};
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.listeners = {};
    useCoachNudges.setState({ unseen: [], counts: {} });
  });

  it("show a notification with the line to say and mark the coach strip until the coach is focused", async () => {
    renderNote();
    await waitFor(() => expect(mocks.listeners.nudged).toBeDefined());

    mocks.listeners.nudged?.({ payload: nudge });

    await waitFor(() =>
      expect(mocks.showNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Open question",
          message: "We can ship the export by Friday.",
        }),
      ),
    );
    expect(
      await screen.findByRole("button", {
        name: "Coach is listening · 1 nudge, new nudge",
      }),
    ).not.toBeNull();

    const [notification] = mocks.showNotification.mock.calls[0] as unknown as [
      { key: string },
    ];
    mocks.listeners.notification?.({
      payload: { type: "notification_confirm", key: notification.key },
    });
    await waitFor(() => expect(mocks.show).toHaveBeenCalledTimes(1));

    mocks.listeners.focused?.({ payload: {} });
    expect(
      await screen.findByRole("button", { name: "Coach is listening · 1 nudge" }),
    ).not.toBeNull();
  });

  it("only marks the strip when notifications are off", async () => {
    mocks.stored = { notification_disabled: true };
    renderNote();
    await waitFor(() => expect(mocks.listeners.nudged).toBeDefined());

    mocks.listeners.nudged?.({ payload: nudge });

    expect(
      await screen.findByRole("button", {
        name: "Coach is listening · 1 nudge, new nudge",
      }),
    ).not.toBeNull();
    expect(mocks.showNotification).not.toHaveBeenCalled();
  });

  it("counts nudges read in the coach without marking them new or notifying", async () => {
    renderNote();
    await waitFor(() => expect(mocks.listeners.nudged).toBeDefined());

    mocks.listeners.nudged?.({ payload: { ...nudge, seen: false } });
    await waitFor(() => expect(mocks.showNotification).toHaveBeenCalledTimes(1));
    mocks.listeners.focused?.({ payload: {} });
    mocks.listeners.nudged?.({ payload: { ...nudge, seen: true } });

    expect(
      await screen.findByRole("button", {
        name: "Coach is listening · 2 nudges",
      }),
    ).not.toBeNull();
    expect(mocks.showNotification).toHaveBeenCalledTimes(1);
  });
});
