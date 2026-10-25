import type { ComponentProps, ReactNode } from "react";

import { CircleNotch } from "@anlg/ui/components/icons";

import { AppToastDismissReason } from "./app-toast";
import { AppToastAlign } from "./app-toast";
import { AppToastPosition } from "./app-toast";
import {
  AppToaster,
  dismissAppToast,
  dismissAppToasts,
  showAppToast,
  type AppToastAction,
  AppToastTone,
} from "./app-toast";

export enum ToastPosition {
  BottomRight = "bottom-right",
  BottomCenter = "bottom-center",
  TopRight = "top-right",
  TopCenter = "top-center",
}

export const TOAST_DURATIONS = {
  success: 3_000,
  info: 4_000,
  warning: 6_000,
  error: 5_000,
} as const;

type ToastOptions = {
  id?: string | number;
  description?: ReactNode;
  descriptionClassName?: string;
  duration?: number;
  dismissible?: boolean;
  closeButton?: boolean;
  icon?: ReactNode;
  action?: AppToastAction;
  secondaryAction?: AppToastAction;
  onDismiss?: () => void;
};

let nextToastId = 0;

function showToast(
  message: ReactNode,
  options: ToastOptions = {},
  tone: AppToastTone = AppToastTone.Info,
) {
  const id = options.id ?? `notification-${++nextToastId}`;
  const requestedDuration = options.duration;
  const durationMs =
    tone === AppToastTone.Error && requestedDuration !== Infinity
      ? requestedDuration === undefined || !Number.isFinite(requestedDuration)
        ? TOAST_DURATIONS.error
        : Math.min(requestedDuration, TOAST_DURATIONS.error)
      : (requestedDuration ??
        (tone === AppToastTone.Loading ? Infinity : TOAST_DURATIONS[tone]));

  showAppToast({
    id: String(id),
    message,
    description: options.descriptionClassName ? (
      <div className={options.descriptionClassName}>{options.description}</div>
    ) : (
      options.description
    ),
    tone: tone === AppToastTone.Loading ? AppToastTone.Info : tone,
    leading:
      options.icon ??
      (tone === AppToastTone.Loading ? (
        <CircleNotch className="animate-spin" />
      ) : undefined),
    durationMs,
    dismissible: options.dismissible,
    closeButton: options.closeButton,
    action: options.action,
    secondaryAction: options.secondaryAction,
    onDismiss: (reason) => {
      if (reason === AppToastDismissReason.User) options.onDismiss?.();
    },
  });
  return id;
}

export const toast = Object.assign(
  (message: ReactNode, options?: ToastOptions) => showToast(message, options),
  {
    message: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options),
    success: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options, AppToastTone.Success),
    info: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options, AppToastTone.Info),
    warning: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options, AppToastTone.Warning),
    error: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options, AppToastTone.Error),
    loading: (message: ReactNode, options?: ToastOptions) =>
      showToast(message, options, AppToastTone.Loading),
    dismiss: (id?: string | number) => {
      if (id === undefined) dismissAppToasts();
      else dismissAppToast(String(id));
    },
  },
);

export function Toaster({
  position = ToastPosition.BottomRight,
  ...props
}: Omit<ComponentProps<typeof AppToaster>, "position"> & {
  position?: ToastPosition;
}) {
  return (
    <AppToaster
      align={
        position.endsWith("right") ? AppToastAlign.End : AppToastAlign.Center
      }
      position={
        position.startsWith("top")
          ? AppToastPosition.Top
          : AppToastPosition.Bottom
      }
      {...props}
    />
  );
}
