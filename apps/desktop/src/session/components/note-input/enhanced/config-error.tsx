import { Trans } from "@lingui/react/macro";

import { Button } from "@anlg/ui/components/ui/button";

import { useTabs } from "~/store/zustand/tabs";

export function ConfigError() {
  const openNew = useTabs((state) => state.openNew);

  return (
    <div
      role="alert"
      className="flex h-full min-h-[400px] flex-col items-center justify-center px-6"
    >
      <div className="mb-6 flex max-w-md flex-col gap-2 text-center">
        <p className="text-base font-medium">
          <Trans>Claude isn’t available</Trans>
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Trans>
            Summaries use Claude through the Claude sign-in on this Mac. Check
            the Claude settings, then try again.
          </Trans>
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="shadow-none"
          onClick={() =>
            openNew({ type: "settings", state: { tab: "claude" } })
          }
        >
          <Trans>Open Claude settings</Trans>
        </Button>
      </div>
    </div>
  );
}
