import { plural, t } from "@lingui/core/macro";

import { type ServerStatus } from "@anlg/plugin-local-stt";

import {
  type DownloadProgress,
  type ToastCondition,
  type ToastType,
} from "./types";

import { AlertLifecycle, ToastDismissal, AlertVariant } from "~/sidebar/enums";
import { DevtoolsToastPreview } from "~/store/zustand/enums";

type ToastRegistryEntry = {
  toast: ToastType;
  condition: ToastCondition;
};

type ToastRegistryParams = {
  hasSttConfigured: boolean;
  isAiTranscriptionTabActive: boolean;
  isBatchTranscribingInActiveTranscriptTab: boolean;
  hasActiveDownload: boolean;
  downloadingModel: string | null;
  activeDownloads: DownloadProgress[];
  localSttStatus: ServerStatus | null;
  isLocalSttModel: boolean;
  onOpenSTTSettings: () => void;
};

type DevtoolsToastPreviewParams = {
  preview: DevtoolsToastPreview;
  onOpenSTTSettings: () => void;
};

export function createToastRegistry({
  hasSttConfigured,
  isAiTranscriptionTabActive,
  isBatchTranscribingInActiveTranscriptTab,
  hasActiveDownload,
  downloadingModel,
  activeDownloads,
  localSttStatus,
  isLocalSttModel,
  onOpenSTTSettings,
}: ToastRegistryParams): ToastRegistryEntry[] {
  const downloadTitle =
    activeDownloads.length === 1 && downloadingModel
      ? t`Downloading ${downloadingModel}`
      : plural(activeDownloads.length, {
          one: "Downloading # model",
          other: "Downloading # models",
        });

  // order matters
  return [
    {
      toast: {
        id: "downloading-model",
        description: downloadTitle,
        detail: activeDownloads
          .map((download) => {
            const status = download.isStarting
              ? t`Starting`
              : `${Math.round(download.progress)}%`;
            return activeDownloads.length === 1
              ? status
              : `${download.displayName}: ${status}`;
          })
          .join(", "),
        lifecycle: {
          type: AlertLifecycle.Persistent,
          dismissal: ToastDismissal.Session,
        },
        loading: true,
      },
      condition: () => hasActiveDownload,
    },
    {
      toast: {
        id: "local-stt-loading",
        description: t`Starting transcription...`,
        lifecycle: { type: AlertLifecycle.ConditionBound },
        loading: true,
      },
      condition: () =>
        isLocalSttModel &&
        localSttStatus === "loading" &&
        !hasActiveDownload &&
        !isBatchTranscribingInActiveTranscriptTab,
    },
    {
      toast: {
        id: "local-stt-unreachable",
        description: t`Transcription unavailable`,
        primaryAction: {
          label: t`Settings`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: AlertLifecycle.ConditionBound },
        variant: AlertVariant.Error,
      },
      condition: () =>
        isLocalSttModel &&
        localSttStatus === "unreachable" &&
        !hasActiveDownload &&
        !isAiTranscriptionTabActive,
    },
    {
      toast: {
        id: "missing-stt",
        description: t`Transcription provider needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: AlertLifecycle.ConditionBound },
      },
      condition: () => !hasSttConfigured && !isAiTranscriptionTabActive,
    },
  ];
}

export function getToastToShow(
  registry: ToastRegistryEntry[],
  isDismissed: (toast: ToastType) => boolean,
): ToastType | null {
  for (const entry of registry) {
    if (
      entry.condition() &&
      (entry.toast.lifecycle.type === AlertLifecycle.ConditionBound ||
        !isDismissed(entry.toast))
    ) {
      return entry.toast;
    }
  }
  return null;
}

export function createDevtoolsToastPreview({
  preview,
  onOpenSTTSettings,
}: DevtoolsToastPreviewParams): ToastType {
  switch (preview) {
    case DevtoolsToastPreview.TranscriptionModel:
      return {
        id: "devtools-missing-stt",
        description: t`Transcription provider needed`,
        primaryAction: {
          label: t`Add`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: AlertLifecycle.ConditionBound },
      };
    case DevtoolsToastPreview.TranscriptionError:
      return {
        id: "devtools-local-stt-unreachable",
        description: t`Transcription unavailable`,
        primaryAction: {
          label: t`Settings`,
          onClick: onOpenSTTSettings,
        },
        lifecycle: { type: AlertLifecycle.ConditionBound },
        variant: AlertVariant.Error,
      };
    case DevtoolsToastPreview.Download:
      return {
        id: "devtools-downloading-model",
        description: t`Downloading model`,
        lifecycle: {
          type: AlertLifecycle.Persistent,
          dismissal: ToastDismissal.Session,
        },
        loading: true,
      };
  }
}
