import { Trans } from "@lingui/react/macro";

import { setSettingValue } from "~/settings/queries";
import { SettingSwitchRow } from "~/settings/setting-row";
import { useConfigValue } from "~/shared/config";

export function MeetingIslandScreenshotSetting() {
  const visible = useConfigValue("overlay_visible_in_screenshots");
  return (
    <SettingSwitchRow
      title={<Trans>Show in screenshots and screen sharing</Trans>}
      description={
        <Trans>
          Turn off to hide the meeting island and captions from anything you
          share or record.
        </Trans>
      }
      checked={visible !== false}
      onChange={(value) => {
        setSettingValue("overlay_visible_in_screenshots", value).catch(
          (error: unknown) => {
            console.error("[meeting-island] failed to save the setting", {
              _e: error,
            });
          },
        );
      }}
    />
  );
}
