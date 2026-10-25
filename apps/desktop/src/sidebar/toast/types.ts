import type { ReactNode } from "react";

import { AlertLifecycle, AlertVariant, ToastDismissal } from "~/sidebar/enums";

type ToastAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void | Promise<void>;
};

export type DownloadProgress = {
  model: string;
  displayName: string;
  progress: number;
  isStarting?: boolean;
};

type ToastLifecycle =
  | { type: AlertLifecycle.ConditionBound }
  | {
      type: AlertLifecycle.Persistent;
      dismissal: ToastDismissal;
      dismissalId?: string;
    };

export type ToastType = {
  id: string;
  icon?: ReactNode;
  description: ReactNode;
  detail?: string;
  primaryAction?: ToastAction;
  lifecycle: ToastLifecycle;
  variant?: AlertVariant;
  loading?: boolean;
};

export type ToastCondition = () => boolean;
