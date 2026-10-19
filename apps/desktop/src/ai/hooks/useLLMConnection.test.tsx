import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  settingsReady: true,
  intelligenceDisabled: false,
}));

vi.mock("@anlg/plugin-coach", () => ({
  commands: { getSettings: mocks.getSettings, llmEndpoint: vi.fn() },
}));
vi.mock("~/settings/queries", () => ({
  useSettingsReady: () => mocks.settingsReady,
}));
vi.mock("~/shared/config", () => ({
  useConfigValues: () => ({
    intelligence_disabled: mocks.intelligenceDisabled,
  }),
}));

import { useLanguageModel, useLLMConnection } from "./useLLMConnection";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  mocks.settingsReady = true;
  mocks.intelligenceDisabled = false;
  mocks.getSettings.mockResolvedValue({
    status: "ok",
    data: { project: null, model: "opus", check_in_minutes: 5 },
  });
});

describe("useLLMConnection", () => {
  it("uses the Claude model chosen in the coach settings", async () => {
    const { result } = renderHook(
      () => ({ connection: useLLMConnection(), model: useLanguageModel() }),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.connection.status).toEqual({
        status: "success",
        providerId: "claude_code",
      }),
    );
    expect(result.current.connection.conn).toEqual({
      providerId: "claude_code",
      modelId: "opus",
    });
    expect(result.current.model).toMatchObject({
      provider: "claude_code",
      modelId: "opus",
    });
  });

  it("stays off when an admin disabled AI, even though Claude is set up", async () => {
    mocks.intelligenceDisabled = true;
    const { result } = renderHook(
      () => ({ connection: useLLMConnection(), model: useLanguageModel() }),
      { wrapper },
    );

    await waitFor(() => expect(mocks.getSettings).toHaveBeenCalled());
    expect(result.current.connection.status).toEqual({
      status: "pending",
      reason: "managed_disabled",
    });
    expect(result.current.model).toBeNull();

    mocks.intelligenceDisabled = false;
    const enabled = renderHook(() => useLLMConnection(), { wrapper });
    await waitFor(() =>
      expect(enabled.result.current.status.status).toBe("success"),
    );
  });

  it("reports unreadable coach settings as an error instead of loading forever", async () => {
    mocks.getSettings.mockResolvedValue({
      status: "error",
      error: "coach plugin unavailable",
    });
    const { result } = renderHook(() => useLLMConnection(), { wrapper });

    await waitFor(() =>
      expect(result.current.status).toEqual({
        status: "error",
        reason: "settings_unavailable",
        message: "coach plugin unavailable",
      }),
    );
    expect(result.current.conn).toBeNull();
  });
});
