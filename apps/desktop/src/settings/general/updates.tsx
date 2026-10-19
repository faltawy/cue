import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useEffect } from "react";

import { commands as openerCommands } from "@anlg/plugin-opener2";
import {
  type UpdaterState,
  commands as updater,
  events as updaterEvents,
} from "@anlg/plugin-updater2";
import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";

import { SettingRow } from "~/settings/setting-row";

const UPDATER_STATE_KEY = ["updater-state"];
const NEW_TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

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

  const onState = (next: UpdaterState) =>
    queryClient.setQueryData(UPDATER_STATE_KEY, next);
  const check = useMutation({
    mutationFn: async () => unwrap(await updater.check()),
    onSuccess: onState,
  });
  const restart = useMutation({
    mutationFn: async () => unwrap(await updater.restart()),
  });
  const clearToken = useMutation({
    mutationFn: async () => unwrap(await updater.clearToken()),
    onSuccess: onState,
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
            controlWidth="content"
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
                <Trans>Restart</Trans>
              </Button>
            )}
          </SettingRow>
        ) : (
          <SettingRow
            controlWidth="content"
            title={<Trans>Cue {currentVersion}</Trans>}
            description={<StatusText state={state} />}
          >
            {(labelProps) =>
              status.kind === "unsupported" ||
              status.kind === "needsToken" ? null : (
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

        {status.kind === "needsToken" && <TokenForm onSaved={onState} />}

        {status.kind !== "unsupported" && status.kind !== "needsToken" && (
          <SettingRow
            controlWidth="content"
            title={<Trans>GitHub token</Trans>}
            description={<Trans>Saved in your Keychain.</Trans>}
          >
            {(labelProps) => (
              <Button
                {...labelProps}
                size="sm"
                variant="ghost"
                disabled={clearToken.isPending}
                onClick={() => clearToken.mutate()}
              >
                <Trans>Remove</Trans>
              </Button>
            )}
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
    case "needsToken":
      return <Trans>Add a GitHub token below to turn on updates.</Trans>;
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

function TokenForm({ onSaved }: { onSaved: (state: UpdaterState) => void }) {
  const { t } = useLingui();
  const save = useMutation({
    mutationFn: async (token: string) => unwrap(await updater.setToken(token)),
    onSuccess: onSaved,
  });
  const form = useForm({
    defaultValues: { token: "" },
    onSubmit: ({ value }) => save.mutate(value.token),
  });

  return (
    <SettingRow
      title={<Trans>GitHub token</Trans>}
      description={
        save.error?.message ?? (
          <>
            <Trans>
              Create a fine-grained token for the faltawy/cue repository with
              Contents set to Read-only, then paste it here.
            </Trans>{" "}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={async () => {
                await openerCommands.openUrl(NEW_TOKEN_URL, null);
              }}
            >
              <Trans>Create a token on GitHub</Trans>
            </Button>
          </>
        )
      }
    >
      {(labelProps) => (
        <form
          className="flex w-full gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="token">
            {(field) => (
              <Input
                {...labelProps}
                type="password"
                autoComplete="off"
                placeholder={t`github_pat_…`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.values.token.trim() === ""}>
            {(empty) => (
              <Button
                type="submit"
                size="sm"
                disabled={empty || save.isPending}
              >
                <Trans>Save</Trans>
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </SettingRow>
  );
}
