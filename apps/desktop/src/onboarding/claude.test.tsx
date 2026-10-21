import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const coach = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSettings: vi.fn(),
  claudeSetup: vi.fn(),
  retryClaudeSetup: vi.fn(),
  claudeSignedIn: vi.fn(),
  signInToClaude: vi.fn(),
}));

vi.mock("@anlg/plugin-coach", () => ({ commands: coach }));

import { ClaudeSection } from "./claude";

function renderStep() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ClaudeSection onContinue={() => {}} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  coach.getSettings.mockResolvedValue({
    status: "ok",
    data: { provider: "claude", model: "sonnet", codex_model: "" },
  });
  coach.claudeSignedIn.mockResolvedValue({
    status: "ok",
    data: { signed_in: false, email: null },
  });
  coach.signInToClaude.mockResolvedValue({ status: "ok", data: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("onboarding Claude step", () => {
  it("shows the Claude download's progress and waits to offer sign-in", async () => {
    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "preparing", percent: 45 },
    });
    renderStep();

    expect(await screen.findByText("Setting up Claude… 45%")).not.toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Sign in to Claude" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(coach.claudeSignedIn).not.toHaveBeenCalled();
  });

  it("once Claude is ready, sign-in is offered", async () => {
    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "ready" },
    });
    renderStep();

    await waitFor(() => expect(coach.claudeSignedIn).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sign in to Claude" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    expect(screen.queryByText(/Setting up Claude/)).toBeNull();
  });

  it("a failed download offers Retry", async () => {
    coach.claudeSetup.mockResolvedValue({
      status: "ok",
      data: {
        state: "failed",
        message: "Offline. Check your internet connection and try again.",
      },
    });
    coach.retryClaudeSetup.mockResolvedValue({
      status: "ok",
      data: { state: "preparing", percent: 0 },
    });
    renderStep();

    expect(
      await screen.findByText(
        "Offline. Check your internet connection and try again.",
      ),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(coach.retryClaudeSetup).toHaveBeenCalledTimes(1),
    );
  });
});
