import { Trans } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";

import {
  type UpdaterState,
  commands as updater,
  events as updaterEvents,
} from "@anlg/plugin-updater2";
import { Button } from "@anlg/ui/components/ui/button";

import { SettingControlWidth } from "~/settings/enums";
import { SettingRow } from "~/settings/setting-row";

const UPDATER_STATE_KEY = ["updater-state"];

function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
) {
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export function UpdateSettings() {
  const queryClient = useQueryClient();
  const { data: state } = useQuery({
    queryKey: UPDATER_STATE_KEY,
    queryFn: async () => unwrap(await updater.getState()),
  });

  useEffect(() => {
    const unlisten = updaterEvents.updaterState.listen(({ payload }) => {
      queryClient.setQueryData(UPDATER_STATE_KEY, payload);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [queryClient]);

  const check = useMutation({
    mutationFn: async () => unwrap(await updater.check()),
    onSuccess: (next) => queryClient.setQueryData(UPDATER_STATE_KEY, next),
  });
  const restart = useMutation({
    mutationFn: async () => unwrap(await updater.restart()),
  });

  if (!state) return null;
  const { status, currentVersion } = state;

  return (
    <div>
      <h2 className="text-title mb-4">
        <Trans>Updates</Trans>
      </h2>
      <div className="flex flex-col gap-4">
        {status.kind === "ready" ? (
          <SettingRow
            controlWidth={SettingControlWidth.Content}
            title={<Trans>Update ready — {status.version}</Trans>}
            description={
              restart.error?.message ?? (
                <Trans>
                  Restart to finish. Cue never restarts mid-meeting.
                </Trans>
              )
            }
          >
            {(labelProps) => (
              <Button
                {...labelProps}
                size="sm"
                disabled={restart.isPending}
                onClick={() => restart.mutate()}
              >
                <Trans>Restart to update</Trans>
              </Button>
            )}
          </SettingRow>
        ) : (
          <SettingRow
            controlWidth={SettingControlWidth.Content}
            title={<Trans>Cue {currentVersion}</Trans>}
            description={<StatusText state={state} />}
          >
            {(labelProps) =>
              status.kind === "unsupported" ? null : (
                <Button
                  {...labelProps}
                  size="sm"
                  variant="secondary"
                  disabled={
                    check.isPending ||
                    status.kind === "checking" ||
                    status.kind === "downloading"
                  }
                  onClick={() => check.mutate()}
                >
                  <Trans>Check for updates</Trans>
                </Button>
              )
            }
          </SettingRow>
        )}
      </div>
    </div>
  );
}

function StatusText({ state }: { state: UpdaterState }) {
  const { status, lastCheckedAtMs } = state;
  switch (status.kind) {
    case "unsupported":
      return <Trans>Updates are only available in release builds.</Trans>;
    case "checking":
      return <Trans>Checking for updates…</Trans>;
    case "downloading":
      return <Trans>Downloading {status.version}…</Trans>;
    case "failed":
      return status.message;
    default: {
      if (lastCheckedAtMs === null) return <Trans>Checks every 6 hours.</Trans>;
      const ago = formatDistanceToNow(lastCheckedAtMs, { addSuffix: true });
      return <Trans>Up to date · checked {ago}</Trans>;
    }
  }
}
