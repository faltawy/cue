import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const openNew = vi.hoisted(() => vi.fn());

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: (selector: (state: { openNew: typeof openNew }) => unknown) =>
    selector({ openNew }),
}));

import { ConfigError } from "./config-error";

describe("ConfigError", () => {
  afterEach(() => {
    cleanup();
    openNew.mockReset();
  });

  it("opens AI settings when the selected provider is unavailable", () => {
    render(<ConfigError />);

    expect(screen.getByRole("alert")).not.toBeNull();
    expect(screen.getByText("AI isn’t available")).not.toBeNull();
    expect(
      screen.getByText(
        "Check your provider and sign-in in AI settings, then try again.",
      ),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Get Pro" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open AI settings" }));
    expect(openNew).toHaveBeenNthCalledWith(1, {
      type: "settings",
      state: { tab: "claude" },
    });
  });
});
