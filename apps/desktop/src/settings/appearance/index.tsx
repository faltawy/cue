import { Trans } from "@lingui/react/macro";

import { AppIconSelector } from "./app-icon";
import { SidebarItemFieldsSettings } from "./sidebar-item-fields";
import { ThemeSelector } from "./theme";
import { TimeFormatSettings } from "./time-format";

import { SettingsPageTitle } from "~/settings/page-title";

export function SettingsAppearance() {
  return (
    <div className="flex flex-col gap-10">
      <SettingsPageTitle title={<Trans>Appearance</Trans>} />
      <ThemeSelector />
      <TimeFormatSettings />
      <AppIconSelector />
      <SidebarItemFieldsSettings />
    </div>
  );
}
