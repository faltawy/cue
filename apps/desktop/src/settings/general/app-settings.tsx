import { Trans } from "@lingui/react/macro";

import { SettingSwitchRow } from "~/settings/setting-row";

interface SettingItem {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

interface AppSettingsViewProps {
  autostart: SettingItem;
  showAppInDock: SettingItem;
  showTrayIcon: SettingItem;
}

export function AppSettingsView({
  autostart,
  showAppInDock,
  showTrayIcon,
}: AppSettingsViewProps) {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex flex-col gap-4">
          <SettingSwitchRow
            title={<Trans>Start Cue at login</Trans>}
            description={<Trans>Have Cue ready when you sign in.</Trans>}
            checked={autostart.value}
            onChange={autostart.onChange}
          />
          <SettingSwitchRow
            title={<Trans>Show app in Dock</Trans>}
            description={<Trans>Show Cue in the Dock and app switcher.</Trans>}
            checked={showAppInDock.value}
            onChange={showAppInDock.onChange}
          />
          <SettingSwitchRow
            title={<Trans>Show tray icon</Trans>}
            description={<Trans>Open Cue from the menu bar.</Trans>}
            checked={showTrayIcon.value}
            onChange={showTrayIcon.onChange}
          />
        </div>
      </section>
    </div>
  );
}
