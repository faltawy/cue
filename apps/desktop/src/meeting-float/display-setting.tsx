import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { commands as windowsCommands } from "@anlg/plugin-windows";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";

import { getIslandDisplayOptions, getSelectedIslandDisplay } from "./display";

import { useSetSettingValue } from "~/settings/queries";
import { SETTING_CONTROL_CLASS, SettingRow } from "~/settings/setting-row";
import { useConfigValue } from "~/shared/config";

export function MeetingIslandDisplaySetting() {
  const { t } = useLingui();
  const stored = useConfigValue("overlay_display");
  const setDisplay = useSetSettingValue("overlay_display");
  const { data: displays = [] } = useQuery({
    queryKey: ["meeting-island-displays"],
    queryFn: async () => {
      const result = await windowsCommands.floatingBarDisplays();
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
    refetchInterval: 3_000,
  });

  if (displays.length === 0) return null;

  const options = getIslandDisplayOptions(displays, {
    camera: t`camera`,
    pointer: t`Follow my pointer`,
  });

  return (
    <SettingRow
      title={<Trans>Show on</Trans>}
      description={
        <Trans>
          Which display the island appears on. You can also drag it there.
        </Trans>
      }
    >
      {(labelProps) => (
        <Select
          value={getSelectedIslandDisplay(stored, displays)}
          onValueChange={setDisplay}
        >
          <SelectTrigger {...labelProps} className={SETTING_CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </SettingRow>
  );
}
