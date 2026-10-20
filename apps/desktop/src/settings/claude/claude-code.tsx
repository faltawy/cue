import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  type ClaudeCodeStatus,
  commands as coachCommands,
} from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";

import { SettingRow } from "~/settings/setting-row";

const CLAUDE_CODE_STATUS_QUERY_KEY = ["claude-code-status"] as const;

async function claudeCodeStatus() {
  const result = await coachCommands.claudeCodeStatus();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

async function updateClaudeCode() {
  const result = await coachCommands.updateClaudeCode();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

function StatusText({ status }: { status: ClaudeCodeStatus }) {
  const minVersion = status.min_version;
  const version = status.installed?.version;
  if (status.using === "installed" && version) {
    return <Trans>Uses your Claude Code {version}.</Trans>;
  }
  if (version) {
    return (
      <Trans>
        Uses Cue's copy of Claude Code {minVersion}. Your Claude Code {version}{" "}
        is older than {minVersion}; update it to use yours.
      </Trans>
    );
  }
  return (
    <Trans>
      Uses Cue's copy of Claude Code {minVersion}. Install Claude Code to use
      your own.
    </Trans>
  );
}

/**
 * Which Claude Code the coach runs: the person's own when it is new enough,
 * else Cue's copy, with an Update action that runs their install's own
 * updater only when pressed.
 */
export function ClaudeCodeRow() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const [before, setBefore] = useState<string>();
  const status = useQuery({
    queryKey: CLAUDE_CODE_STATUS_QUERY_KEY,
    queryFn: claudeCodeStatus,
    refetchOnWindowFocus: "always",
  });
  const update = useMutation({
    mutationFn: updateClaudeCode,
    onSuccess: (result) =>
      queryClient.setQueryData(CLAUDE_CODE_STATUS_QUERY_KEY, result.status),
  });

  const after = update.data?.status.installed?.version;
  const lastLine = update.data?.output.trim().split("\n").pop();
  const updateFailure =
    update.data && update.data.status.using !== "installed"
      ? after && after !== before
        ? t`Claude Code updated to ${after}, which is still older than ${update.data.status.min_version}.`
        : lastLine
          ? t`Claude Code didn't update: ${lastLine}`
          : t`Claude Code didn't update.`
      : null;
  const error = status.error ?? update.error;

  return (
    <SettingRow
      title={<Trans>Claude Code</Trans>}
      description={
        error ? (
          <span role="alert" className="text-destructive">
            {error.message}
          </span>
        ) : !status.data ? (
          <Trans>Checking…</Trans>
        ) : (
          <>
            <StatusText status={status.data} />
            {updateFailure && (
              <span role="alert" className="text-destructive block">
                {updateFailure}
              </span>
            )}
          </>
        )
      }
      controlWidth="content"
    >
      {({ "aria-describedby": describedBy }) =>
        status.data?.using === "cue" && status.data.installed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-describedby={describedBy}
            disabled={update.isPending}
            onClick={() => {
              setBefore(status.data?.installed?.version);
              update.mutate();
            }}
          >
            {update.isPending ? (
              <Trans>Updating…</Trans>
            ) : (
              <Trans>Update Claude Code</Trans>
            )}
          </Button>
        ) : null
      }
    </SettingRow>
  );
}
