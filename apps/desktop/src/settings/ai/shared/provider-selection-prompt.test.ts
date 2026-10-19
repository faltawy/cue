import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setSettingValues: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({
    t: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (message, part, index) =>
          `${message}${part}${index < values.length ? String(values[index]) : ""}`,
        "",
      ),
  }),
}));

vi.mock("@anlg/ui/components/ui/toast", () => ({
  toast: { success: mocks.toastSuccess },
}));

vi.mock("~/settings/queries", () => ({
  setSettingValues: mocks.setSettingValues,
}));

import { useProviderSelectionPrompt } from "./provider-selection-prompt";

describe("useProviderSelectionPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setSettingValues.mockResolvedValue(undefined);
  });

  it("sets a transcription provider and lets model resolution choose its model", () => {
    const { result } = renderHook(() =>
      useProviderSelectionPrompt({
        providerType: "stt",
        providerId: "deepgram",
        providerName: "Deepgram",
        currentProvider: "soniox",
        providerStateReady: true,
        storedApiKey: "",
      }),
    );

    act(() => result.current("dg-new"));
    const toastOptions = mocks.toastSuccess.mock.calls[0][1];
    act(() => toastOptions.action.onClick());

    expect(mocks.setSettingValues).toHaveBeenCalledWith({
      current_stt_provider: "deepgram",
      current_stt_model: "",
    });
  });

  it("does not prompt for the current provider or an existing API key", () => {
    const currentProvider = renderHook(() =>
      useProviderSelectionPrompt({
        providerType: "stt",
        providerId: "deepgram",
        providerName: "Deepgram",
        currentProvider: "deepgram",
        providerStateReady: true,
        storedApiKey: "",
      }),
    );
    const existingKey = renderHook(() =>
      useProviderSelectionPrompt({
        providerType: "stt",
        providerId: "deepgram",
        providerName: "Deepgram",
        currentProvider: "soniox",
        providerStateReady: true,
        storedApiKey: "dg-existing",
      }),
    );

    act(() => currentProvider.result.current("sk-new"));
    act(() => existingKey.result.current("dg-replaced"));

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("prompts only once while the same new key is being saved", () => {
    const { result } = renderHook(() =>
      useProviderSelectionPrompt({
        providerType: "stt",
        providerId: "deepgram",
        providerName: "Deepgram",
        currentProvider: "soniox",
        providerStateReady: true,
        storedApiKey: "",
      }),
    );

    act(() => result.current("s"));
    act(() => result.current("sk-new"));

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });
});
