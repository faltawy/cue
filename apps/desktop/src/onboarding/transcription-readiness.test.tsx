import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: {
    current_stt_provider: undefined as string | undefined,
    current_stt_model: undefined as string | undefined,
  },
  openCurrent: vi.fn(),
  configured: false,
}));

vi.mock("~/shared/config", () => ({ useConfigValues: () => mocks.config }));
vi.mock("~/stt/capabilities", () => ({
  isConfiguredSttModel: () => mocks.configured,
}));
vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: unknown) => unknown) =>
    selector({ openCurrent: mocks.openCurrent }),
}));

import { TranscriptionReadiness } from "./transcription-readiness";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config = {
    current_stt_provider: undefined,
    current_stt_model: undefined,
  };
  mocks.configured = false;
});
afterEach(cleanup);

describe("TranscriptionReadiness", () => {
  it("says recording remains available when transcription is not set up", () => {
    render(<TranscriptionReadiness />);
    expect(
      screen.getByText(/Recording works without transcription/),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Open transcription settings" }),
    );
    expect(mocks.openCurrent).toHaveBeenCalledWith({
      type: "settings",
      state: { tab: "transcription" },
    });
  });

  it("does not promise a transcript solely because a model is selected", () => {
    mocks.configured = true;
    mocks.config = {
      current_stt_provider: "deepgram",
      current_stt_model: "nova-3",
    };
    render(<TranscriptionReadiness />);
    expect(
      screen.getByText(
        /Provider access and model readiness determine when transcripts are available/,
      ),
    ).toBeTruthy();
  });
});
