import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";

import { commands } from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";

import { SettingRow } from "~/settings/setting-row";

export enum BrowserSetupAction {
  Prepare = "prepare",
  OpenExtensions = "open_extensions",
  RevealFolder = "reveal_folder",
  Disconnect = "disconnect",
}

export function BrowserExtensionSettings() {
  const prepare = useMutation({
    mutationFn: async () => {
      const result = await commands.browserExtensionSetup(
        BrowserSetupAction.Prepare,
      );
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
  });
  const action = useMutation({
    mutationFn: async (action: BrowserSetupAction) => {
      const result = await commands.browserExtensionSetup(action);
      if (result.status === "error") throw new Error(result.error);
    },
  });
  const pending = prepare.isPending || action.isPending;
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-title">
        <Trans>Browser extension</Trans>
      </h2>
      <SettingRow
        title={<Trans>Private cues in Brave</Trans>}
        description={
          <Trans>
            Connect a browser meeting to Cue. The bundled extension currently
            supports Google Meet.
          </Trans>
        }
      >
        {(labelProps) => (
          <Button
            {...labelProps}
            variant="outline"
            disabled={pending}
            onClick={() => prepare.mutate()}
          >
            <Trans>Set up Brave extension</Trans>
          </Button>
        )}
      </SettingRow>
      <ol className="text-label text-muted-foreground list-decimal space-y-2 ps-4">
        <li>
          <Trans>
            Set up the extension, then open Brave’s extensions page and turn on
            Developer mode.
          </Trans>
        </li>
        <li>
          <Trans>
            Choose Load unpacked and select the extension folder opened by Cue.
          </Trans>
        </li>
        <li>
          <Trans>
            Open your meeting, join the call, and use the Cue toolbar button to
            connect it to the recording in Cue.
          </Trans>
        </li>
      </ol>
      {prepare.data && (
        <p className="text-label text-muted-foreground break-all" role="status">
          <Trans>Extension folder:</Trans> {prepare.data.directory}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => action.mutate(BrowserSetupAction.OpenExtensions)}
        >
          <Trans>Open Brave extensions</Trans>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => action.mutate(BrowserSetupAction.RevealFolder)}
        >
          <Trans>Open extension folder</Trans>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => action.mutate(BrowserSetupAction.Disconnect)}
        >
          <Trans>Disconnect browser access</Trans>
        </Button>
      </div>
      <p className="text-label text-muted-foreground">
        <Trans>
          After updating Cue, set up the extension again and click Reload on its
          card in Brave. Nothing is published to an extension store.
        </Trans>
      </p>
      {(prepare.error || action.error) && (
        <p role="alert" className="text-label text-destructive">
          {prepare.error?.message ?? action.error?.message}
        </p>
      )}
      {action.isSuccess &&
        action.variables === BrowserSetupAction.Disconnect && (
          <p role="status" className="text-label text-muted-foreground">
            <Trans>Browser access disconnected.</Trans>
          </p>
        )}
    </section>
  );
}
