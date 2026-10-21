import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(
    async (
      _title: string,
      _userId: string,
      _initial: { event_json: string },
    ) => "test-session",
  ),
  softDeleteSession: vi.fn(async () => ({
    session: { id: "test-session", title: "Cue test recording" },
    tombstone: "now",
    deletedAt: 1,
  })),
  openSessionAndListen: vi.fn(),
  recordingActive: false,
}));

vi.mock("~/session/queries", () => ({ createSession: mocks.createSession }));
vi.mock("~/session/queries/deletion", () => ({
  softDeleteSession: mocks.softDeleteSession,
}));
vi.mock("~/shared/useNewNote", () => ({
  openSessionAndListen: mocks.openSessionAndListen,
}));
vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: unknown) => unknown) =>
    selector({
      live: {
        sessionId: "test-session",
        status: mocks.recordingActive ? "active" : "inactive",
      },
    }),
}));

import { TestRecordingSection } from "./test-recording";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordingActive = false;
});
afterEach(cleanup);

describe("TestRecordingSection", () => {
  it("starts only after an explicit choice and creates an identifiable recording note", async () => {
    render(<TestRecordingSection />);

    expect(mocks.createSession).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Try a short test recording" }),
    );

    await waitFor(() => expect(mocks.createSession).toHaveBeenCalledTimes(1));
    const [title, , initial] = mocks.createSession.mock.calls[0]!;
    expect(title).toBe("Cue test recording");
    expect(JSON.parse(initial.event_json).tracking_id).toBe(
      "cue-onboarding-test-recording-v1",
    );
    expect(mocks.openSessionAndListen).toHaveBeenCalledWith("test-session", {
      behavior: "new",
    });
  });

  it("offers deletion after recording and waits until capture has stopped", async () => {
    mocks.recordingActive = true;
    const view = render(<TestRecordingSection />);
    fireEvent.click(
      screen.getByRole("button", { name: "Try a short test recording" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Delete test note" }),
      ).toBeTruthy(),
    );

    expect(
      (
        screen.getByRole("button", {
          name: "Delete test note",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(mocks.softDeleteSession).not.toHaveBeenCalled();

    mocks.recordingActive = false;
    view.rerender(<TestRecordingSection />);
    fireEvent.click(screen.getByRole("button", { name: "Delete test note" }));
    await waitFor(() =>
      expect(mocks.softDeleteSession).toHaveBeenCalledWith("test-session"),
    );
    expect(
      screen.queryByRole("button", { name: "Delete test note" }),
    ).toBeNull();
  });
});
