import { describe, expect, it, vi } from "vitest";

import { createToastRegistry, getToastToShow } from "./registry";

type RegistryParams = Parameters<typeof createToastRegistry>[0];

const baseParams: RegistryParams = {
  hasSttConfigured: true,
  isAiTranscriptionTabActive: false,
  isBatchTranscribingInActiveTranscriptTab: false,
  hasActiveDownload: false,
  downloadingModel: null,
  activeDownloads: [],
  localSttStatus: null,
  isLocalSttModel: false,
  onOpenSTTSettings: vi.fn(),
};

type Toast = NonNullable<ReturnType<typeof getToastToShow>>;

function showToast(
  overrides: Partial<RegistryParams> = {},
  isDismissed: (toast: Toast) => boolean = () => false,
) {
  return getToastToShow(
    createToastRegistry({ ...baseParams, ...overrides }),
    isDismissed,
  );
}

describe("sidebar toast registry", () => {
  it("requires transcription setup even if it was dismissed previously", () => {
    const toast = showToast(
      { hasSttConfigured: false },
      (toast) => toast.id === "missing-stt",
    );

    expect(toast?.id).toBe("missing-stt");
    expect(toast?.lifecycle).toEqual({ type: "condition-bound" });
  });

  it("never asks for a language model once transcription is set up", () => {
    expect(showToast()).toBeNull();
    expect(showToast({ hasSttConfigured: false })?.id).toBe("missing-stt");
  });

  it("shows local STT loading unless the transcript tab shows batch progress", () => {
    const loading = {
      localSttStatus: "loading",
      isLocalSttModel: true,
    } as const;

    expect(showToast(loading)?.id).toBe("local-stt-loading");
    expect(
      showToast({ ...loading, isBatchTranscribingInActiveTranscriptTab: true }),
    ).toBeNull();
  });

  it("lets users dismiss a model download toast for the current download", () => {
    const toast = showToast({
      hasActiveDownload: true,
      downloadingModel: "apple-speech",
      activeDownloads: [
        { model: "apple-speech", displayName: "apple-speech", progress: 0 },
      ],
    });

    expect(toast).toMatchObject({
      id: "downloading-model",
      lifecycle: { type: "persistent", dismissal: "session" },
      loading: true,
    });
  });
});
