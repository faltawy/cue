import { Trans, useLingui } from "@lingui/react/macro";

import { Lock } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

export function LockScreen({
  title,
  description,
  action,
  authenticating,
  onUnlock,
  className,
}: {
  title: string;
  description?: string;
  action?: string;
  authenticating: boolean;
  onUnlock: () => void;
  className?: string;
}) {
  return (
    <div
      data-lock-screen
      data-tauri-drag-region
      className={cn([
        "flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center",
        className ?? "bg-background",
      ])}
    >
      <div className="flex max-w-sm flex-col items-center px-6 text-center">
        <Lock className="text-muted-foreground size-4" />
        <h1 className="text-title mt-3">{title}</h1>
        {description ? (
          <p className="text-muted-foreground text-ui mt-1 text-balance">
            {description}
          </p>
        ) : null}
        <Button
          className="mt-4"
          disabled={authenticating}
          onClick={onUnlock}
          data-tauri-drag-region="false"
        >
          {authenticating ? (
            <Trans>Authenticating…</Trans>
          ) : action ? (
            action
          ) : (
            <Trans>Unlock</Trans>
          )}
        </Button>
      </div>
    </div>
  );
}

export function useDeviceAuthHint() {
  const { t } = useLingui();
  return t`Use Touch ID or enter your password to view.`;
}

export function NoteLockScreen({
  sessionTitle,
  authenticating,
  onUnlock,
}: {
  sessionTitle?: string;
  authenticating: boolean;
  onUnlock: () => void;
}) {
  const { t } = useLingui();
  const hint = useDeviceAuthHint();
  return (
    <LockScreen
      title={sessionTitle || t`Note is Locked`}
      description={hint}
      action={t`View Note`}
      authenticating={authenticating}
      onUnlock={onUnlock}
      className="bg-transparent"
    />
  );
}
