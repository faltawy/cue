import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UnsupportedLocalSttRepair } from "./unsupported-local-stt-repair";

const settingsState = vi.hoisted(() => ({
  currentArch: "aarch64",
  values: {
    current_stt_provider: undefined as string | undefined,
    current_stt_model: undefined as string | undefined,
  },
  setSettingValues: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  arch: () => settingsState.currentArch,
}));

vi.mock("~/shared/config", () => ({
  useConfigValues: (keys: Array<keyof typeof settingsState.values>) =>
    Object.fromEntries(keys.map((key) => [key, settingsState.values[key]])),
}));

vi.mock("~/settings/queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/settings/queries")>();
  return {
    ...actual,
    setSettingValues: settingsState.setSettingValues,
  };
});

function renderRepair(currentArch: string, provider: string, model: string) {
  settingsState.currentArch = currentArch;
  settingsState.values.current_stt_provider = provider;
  settingsState.values.current_stt_model = model;
  return render(<UnsupportedLocalSttRepair />);
}

describe("UnsupportedLocalSttRepair", () => {
  beforeEach(() => {
    settingsState.currentArch = "aarch64";
    settingsState.setSettingValues.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("clears on-device transcription where it cannot run and leaves supported selections alone", async () => {
    renderRepair("x86_64", "soniqo", "soniqo-parakeet-streaming");

    await waitFor(() => {
      expect(settingsState.setSettingValues).toHaveBeenCalledWith({
        current_stt_provider: "",
        current_stt_model: "",
      });
    });
    expect(settingsState.setSettingValues).toHaveBeenCalledTimes(1);
    cleanup();
    settingsState.setSettingValues.mockClear();

    renderRepair("aarch64", "soniqo", "soniqo-parakeet-streaming");
    renderRepair("x86_64", "soniox", "stt-rt-v5");

    expect(settingsState.setSettingValues).not.toHaveBeenCalled();
  });
});
