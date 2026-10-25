import type { MouseEvent } from "react";

import { toast, TOAST_DURATIONS } from "@anlg/ui/components/ui/toast";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { AlertVariant, AlertLifecycle } from "~/sidebar/enums";

export function SettingsAlertToast({
  id,
  description,
  variant = AlertVariant.Default,
  lifecycle,
  action,
}: {
  id: string;
  description?: string;
  variant?: AlertVariant;
  lifecycle: AlertLifecycle;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}) {
  if (!description) {
    return null;
  }

  return (
    <SettingsAlertToastLifecycle
      key={`${id}:${description}:${lifecycle}:${action?.label ?? ""}`}
      id={id}
      description={description}
      variant={variant}
      lifecycle={lifecycle}
      action={action}
    />
  );
}

function SettingsAlertToastLifecycle({
  id,
  description,
  variant,
  lifecycle,
  action,
}: {
  id: string;
  description: string;
  variant: AlertVariant;
  lifecycle: AlertLifecycle;
  action?: {
    label: string;
    onClick: () => void | Promise<void>;
  };
}) {
  useMountEffect(() => {
    const dismissible = lifecycle === AlertLifecycle.Persistent;
    const options = {
      id,
      duration:
        variant === AlertVariant.Error ? TOAST_DURATIONS.error : Infinity,
      dismissible,
      closeButton: dismissible,
      ...(action
        ? {
            action: {
              label: action.label,
              onClick: (event: MouseEvent<HTMLButtonElement>) => {
                event.preventDefault();
                void action.onClick();
              },
            },
          }
        : {}),
    };

    if (variant === AlertVariant.Error) {
      toast.error(description, options);
    } else if (variant === AlertVariant.Warning) {
      toast.warning(description, options);
    } else {
      toast.message(description, options);
    }

    return () => {
      toast.dismiss(id);
    };
  });

  return null;
}
