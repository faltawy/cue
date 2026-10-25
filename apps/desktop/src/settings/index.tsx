import { cn } from "@anlg/utils";

import {
  SettingsApp,
  SettingsMeetings,
  SettingsNotifications,
  SettingsPermissions,
} from "./general";
import { SettingsTodo } from "./todo";

import { STT } from "~/settings/ai/stt";
import { SettingsAppearance } from "~/settings/appearance";
import { SettingsClaude } from "~/settings/claude";
import { SettingsDictation } from "~/settings/dictation";
import { SettingsDictionary } from "~/settings/dictionary";
import { SettingsHydrationBoundary } from "~/settings/hydration-boundary";
import { StandardContentWrapper } from "~/shared/main";
import { type Tab } from "~/store/zustand/tabs";
import { TabType, SettingsTab } from "~/store/zustand/tabs/enums";

export function TabContentSettings({
  tab,
}: {
  tab: Extract<Tab, { type: TabType.Settings }>;
}) {
  return (
    <StandardContentWrapper>
      <SettingsHydrationBoundary>
        <SettingsView tab={tab} />
      </SettingsHydrationBoundary>
    </StandardContentWrapper>
  );
}

function SettingsView({
  tab,
}: {
  tab: Extract<Tab, { type: TabType.Settings }>;
}) {
  const requestedTab = tab.state.tab as string | undefined;
  const activeTab =
    requestedTab === "personalization"
      ? "dictionary"
      : requestedTab === "audio"
        ? "meetings"
        : (tab.state.tab ?? SettingsTab.App);

  const renderContent = () => {
    switch (activeTab) {
      case SettingsTab.App:
        return <SettingsApp />;
      case SettingsTab.Meetings:
        return <SettingsMeetings />;
      case SettingsTab.Appearance:
        return <SettingsAppearance />;
      case SettingsTab.Notifications:
        return <SettingsNotifications />;
      case SettingsTab.Permissions:
        return <SettingsPermissions />;
      case SettingsTab.Dictionary:
        return <SettingsDictionary />;
      case SettingsTab.Dictation:
        return <SettingsDictation />;
      case SettingsTab.Transcription:
        return <STT />;
      case SettingsTab.Claude:
        return <SettingsClaude />;
      case SettingsTab.Todo:
        return <SettingsTodo />;
      default:
        return <SettingsApp />;
    }
  };

  return (
    <div
      data-settings-content
      className="bg-card flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <div
          className={cn([
            "scroll-fade-y scrollbar-hide h-full min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto px-6 pt-6 pb-10",
          ])}
        >
          <div className="mx-auto w-full max-w-3xl">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}
