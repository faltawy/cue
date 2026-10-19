import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const TOKEN = "github_pat_11ABCDEFG0123456789";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  setToken: vi.fn(),
}));

vi.mock("@anlg/plugin-updater2", () => ({
  commands: {
    getState: mocks.getState,
    setToken: mocks.setToken,
    check: vi.fn(),
    restart: vi.fn(),
    clearToken: vi.fn(),
  },
  events: {
    updaterState: { listen: async () => () => {} },
  },
}));
vi.mock("@anlg/plugin-opener2", () => ({ commands: { openUrl: vi.fn() } }));

import { UpdateSettings } from "./updates";

function state(kind: "needsToken" | "idle") {
  return {
    currentVersion: "0.1.0",
    status: { kind },
    lastCheckedAtMs: null,
  };
}

describe("UpdateSettings", () => {
  afterEach(cleanup);

  it("saves a pasted token and never shows it again", async () => {
    mocks.getState.mockResolvedValue({
      status: "ok",
      data: state("needsToken"),
    });
    mocks.setToken.mockResolvedValue({ status: "ok", data: state("idle") });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { container } = render(
      <QueryClientProvider client={client}>
        <UpdateSettings />
      </QueryClientProvider>,
    );

    const input = await screen.findByPlaceholderText("github_pat_…");
    fireEvent.change(input, { target: { value: TOKEN } });
    expect(container.innerHTML).toContain(TOKEN);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Saved in your Keychain.");
    expect(mocks.setToken).toHaveBeenCalledWith(TOKEN);
    expect(container.innerHTML).not.toContain(TOKEN);
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("github_pat_…")).toBeNull(),
    );
  });
});
