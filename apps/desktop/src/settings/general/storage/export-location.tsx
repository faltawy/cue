import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQuery } from "@tanstack/react-query";
import { downloadDir, homeDir } from "@tauri-apps/api/path";
import { open as selectFolder } from "@tauri-apps/plugin-dialog";

import { commands as openerCommands } from "@anlg/plugin-opener2";
import { CircleNotch, FolderSimple } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";

import { displayPath } from "./path-utils";

import { ExportLocationAction } from "~/settings/enums";
import {
  setSettingValue,
  useStoredSettingValuesQuery,
} from "~/settings/queries";

export function ExportLocationRow() {
  const { t } = useLingui();
  const settings = useStoredSettingValuesQuery();
  const directory = settings.data?.values.export_directory;
  const { data: home } = useQuery({ queryKey: ["home-dir"], queryFn: homeDir });
  const downloads = useQuery({
    queryKey: ["download-dir"],
    queryFn: downloadDir,
    enabled: !directory,
  });
  const path = directory || downloads.data;
  const changeMutation = useMutation({
    mutationFn: async (action: ExportLocationAction) => {
      if (action === ExportLocationAction.Reset) {
        await setSettingValue("export_directory", "");
        return;
      }

      const selected = await selectFolder({
        title: t`Choose export folder`,
        directory: true,
        multiple: false,
        defaultPath: path,
      });
      if (selected && selected !== path) {
        await setSettingValue("export_directory", selected);
      }
    },
  });
  const disabled =
    settings.isLoading || !!settings.error || changeMutation.isPending;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-ui font-medium">
            <Trans>Export location</Trans>
          </p>
          <p className="text-muted-foreground text-label mt-0.5">
            <Trans>
              Save PDF, text, Markdown, and Org exports to this folder.
            </Trans>
          </p>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-label mt-1 flex max-w-full min-w-0 items-center gap-1 rounded-sm text-start transition-colors duration-100"
            disabled={settings.isLoading || !!settings.error || !path}
            title={path}
            onClick={() => {
              if (path) void openerCommands.openPath(path, null);
            }}
          >
            <FolderSimple className="size-3 shrink-0" />
            <span className="truncate">{displayPath(path, home)}</span>
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={disabled}
          onClick={() => changeMutation.mutate(ExportLocationAction.Choose)}
        >
          {changeMutation.isPending && (
            <CircleNotch className="animate-spin" aria-hidden="true" />
          )}
          <Trans>Choose folder</Trans>
        </Button>
      </div>
      {directory && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="mt-1"
          disabled={disabled}
          onClick={() => changeMutation.mutate(ExportLocationAction.Reset)}
        >
          <Trans>Reset to Downloads</Trans>
        </Button>
      )}
      {(settings.error || downloads.error || changeMutation.error) && (
        <p role="alert" className="text-label text-destructive mt-1">
          <Trans>Could not update the export folder</Trans>
        </p>
      )}
    </div>
  );
}
