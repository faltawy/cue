import { useCallback, useMemo, useRef, useState } from "react";

import {
  toast as notificationToast,
  TOAST_DURATIONS,
} from "@anlg/ui/components/ui/toast";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import {
  createDevtoolsToastPreview,
  createToastRegistry,
  getToastToShow,
} from "./registry";
import type { ToastType } from "./types";
import { useDismissedToasts } from "./useDismissedToasts";

import { useNotifications } from "~/contexts/notifications";
import { useConfigValues } from "~/shared/config";
import { useLatestRef } from "~/shared/hooks/useLatestRef";
import { useDevtoolsToastPreview } from "~/store/zustand/devtools-toast-preview";
import { useTabs } from "~/store/zustand/tabs";
import { isConfiguredSttModel } from "~/stt/capabilities";
import { useListener } from "~/stt/contexts";

export function ToastNotifications() {
  const { dismissToast, isDismissed } = useDismissedToasts();
  const [sessionDismissedToastIds, setSessionDismissedToastIds] = useState(
    () => new Set<string>(),
  );
  const shouldShowToast = useShouldShowToast();
  const {
    hasActiveDownload,
    downloadingModel,
    activeDownloads,
    localSttStatus,
    isLocalSttModel,
  } = useNotifications();
  const [observedHasActiveDownload, setObservedHasActiveDownload] =
    useState(hasActiveDownload);
  if (observedHasActiveDownload !== hasActiveDownload) {
    setObservedHasActiveDownload(hasActiveDownload);
    if (!hasActiveDownload) {
      setSessionDismissedToastIds((current) => {
        if (!current.has("downloading-model")) {
          return current;
        }

        const next = new Set(current);
        next.delete("downloading-model");
        return next;
      });
    }
  }

  const { current_stt_provider, current_stt_model } = useConfigValues([
    "current_stt_provider",
    "current_stt_model",
  ] as const);
  const hasSttConfigured = isConfiguredSttModel(
    current_stt_provider,
    current_stt_model,
  );

  const currentTab = useTabs((state) => state.currentTab);
  const devtoolsPreview = useDevtoolsToastPreview((state) => state.preview);
  const clearDevtoolsPreview = useDevtoolsToastPreview(
    (state) => state.clearPreview,
  );
  const isAiTranscriptionTabActive =
    currentTab?.type === "settings" &&
    currentTab.state?.tab === "transcription";
  const activeTranscriptSessionId =
    currentTab?.type === "sessions" &&
    currentTab.state.view?.type === "transcript"
      ? currentTab.id
      : null;
  const isBatchTranscribingInActiveTranscriptTab = useListener((state) =>
    activeTranscriptSessionId
      ? state.getSessionMode(activeTranscriptSessionId) === "running_batch"
      : false,
  );

  const openNew = useTabs((state) => state.openNew);
  const updateSettingsTabState = useTabs(
    (state) => state.updateSettingsTabState,
  );

  const handleOpenSTTSettings = useCallback(() => {
    if (currentTab?.type === "settings") {
      updateSettingsTabState(currentTab, { tab: "transcription" });
    } else {
      openNew({ type: "settings", state: { tab: "transcription" } });
    }
  }, [currentTab, openNew, updateSettingsTabState]);

  const registry = useMemo(
    () =>
      createToastRegistry({
        hasSttConfigured,
        isAiTranscriptionTabActive,
        isBatchTranscribingInActiveTranscriptTab,
        hasActiveDownload,
        downloadingModel,
        activeDownloads,
        localSttStatus,
        isLocalSttModel,
        onOpenSTTSettings: handleOpenSTTSettings,
      }),
    [
      hasSttConfigured,
      isAiTranscriptionTabActive,
      isBatchTranscribingInActiveTranscriptTab,
      hasActiveDownload,
      downloadingModel,
      activeDownloads,
      localSttStatus,
      isLocalSttModel,
      handleOpenSTTSettings,
    ],
  );

  const isToastDismissed = useCallback(
    (toast: ToastType) => {
      if (toast.lifecycle.type === "condition-bound") {
        return false;
      }

      const dismissalId = toast.lifecycle.dismissalId ?? toast.id;
      if (toast.lifecycle.dismissal === "permanent") {
        return isDismissed(dismissalId);
      }
      return sessionDismissedToastIds.has(dismissalId);
    },
    [isDismissed, sessionDismissedToastIds],
  );

  const currentToast = useMemo(
    () => getToastToShow(registry, isToastDismissed),
    [registry, isToastDismissed],
  );
  const devtoolsToast = useMemo(
    () =>
      devtoolsPreview
        ? createDevtoolsToastPreview({
            preview: devtoolsPreview.type,
            onOpenSTTSettings: handleOpenSTTSettings,
          })
        : null,
    [devtoolsPreview, handleOpenSTTSettings],
  );

  const registryPriorityToast =
    currentToast?.id === "downloading-model" ? currentToast : null;
  const displayToast = registryPriorityToast ?? devtoolsToast ?? currentToast;

  const handleDismiss = useCallback(() => {
    if (devtoolsToast) {
      clearDevtoolsPreview();
      return;
    }

    if (currentToast) {
      if (currentToast.lifecycle.type === "condition-bound") {
        return;
      }

      const dismissalId = currentToast.lifecycle.dismissalId ?? currentToast.id;
      if (currentToast.lifecycle.dismissal === "permanent") {
        dismissToast(dismissalId);
        return;
      }
      setSessionDismissedToastIds((current) =>
        new Set(current).add(dismissalId),
      );
    }
  }, [clearDevtoolsPreview, currentToast, devtoolsToast, dismissToast]);

  if (!shouldShowToast || !displayToast) {
    return null;
  }

  const previewKey =
    devtoolsPreview && devtoolsToast
      ? `${devtoolsToast.id}:${devtoolsPreview.key}`
      : displayToast.id;

  return (
    <NotificationToast
      key={previewKey}
      toast={displayToast}
      onDismiss={
        displayToast.lifecycle.type === "persistent" ? handleDismiss : undefined
      }
    />
  );
}

function toastPresentation(toast: ToastType) {
  const description =
    typeof toast.description === "string" ? toast.description : toast.id;
  return [
    toast.id,
    description,
    toast.detail ?? "",
    toast.variant ?? "default",
    toast.loading ? "loading" : "idle",
    toast.primaryAction?.label ?? "",
  ].join(":");
}

function showNotification(
  toast: ToastType,
  toastRef: { current: ToastType },
  onDismissRef: { current?: () => void },
  dismissal: { persist: boolean },
) {
  const dismissible = toast.lifecycle.type === "persistent";
  const options = {
    id: toast.id,
    description: toast.detail,
    duration: toast.variant === "error" ? TOAST_DURATIONS.error : Infinity,
    closeButton: dismissible,
    dismissible,
    icon: toast.icon,
    action: toast.primaryAction
      ? {
          label: toast.primaryAction.label,
          onClick: () => {
            dismissal.persist = false;
            void toastRef.current.primaryAction?.onClick();
          },
        }
      : undefined,
    onDismiss: () => {
      if (dismissal.persist) {
        onDismissRef.current?.();
      }
    },
  };

  if (toast.loading) {
    notificationToast.loading(toast.description, options);
  } else if (toast.variant === "error") {
    notificationToast.error(toast.description, options);
  } else if (toast.variant === "warning") {
    notificationToast.warning(toast.description, options);
  } else {
    notificationToast.message(toast.description, options);
  }
}

function NotificationToast({
  toast,
  onDismiss,
}: {
  toast: ToastType;
  onDismiss?: () => void;
}) {
  const toastRef = useLatestRef(toast);
  const onDismissRef = useLatestRef(onDismiss);
  const dismissalRef = useRef({ persist: true });
  const shownPresentationRef = useRef<string | null>(null);
  const presentation = toastPresentation(toast);

  if (
    shownPresentationRef.current !== null &&
    shownPresentationRef.current !== presentation
  ) {
    shownPresentationRef.current = presentation;
    showNotification(toast, toastRef, onDismissRef, dismissalRef.current);
  }

  useMountEffect(() => {
    dismissalRef.current.persist = true;
    shownPresentationRef.current = toastPresentation(toast);
    showNotification(toast, toastRef, onDismissRef, dismissalRef.current);

    return () => {
      dismissalRef.current.persist = false;
      notificationToast.dismiss(toast.id);
    };
  });

  return null;
}

function useShouldShowToast() {
  const [showToast, setShowToast] = useState(false);

  useMountEffect(() => {
    const timer = setTimeout(() => {
      setShowToast(true);
    }, 500);

    return () => clearTimeout(timer);
  });

  return showToast;
}
