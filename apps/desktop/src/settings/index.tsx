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

export function TabContentSettings({
  tab,
}: {
  tab: Extract<Tab, { type: "settings" }>;
}) {
  return (
    <StandardContentWrapper>
      <SettingsHydrationBoundary>
        <SettingsView tab={tab} />
      </SettingsHydrationBoundary>
    </StandardContentWrapper>
  );
}

function SettingsView({ tab }: { tab: Extract<Tab, { type: "settings" }> }) {
  const requestedTab = tab.state.tab as string | undefined;
  const activeTab =
    requestedTab === "personalization"
      ? "dictionary"
      : requestedTab === "audio"
        ? "meetings"
        : (tab.state.tab ?? "app");

  const renderContent = () => {
    switch (activeTab) {
      case "app":
        return <SettingsApp />;
      case "meetings":
        return <SettingsMeetings />;
      case "appearance":
        return <SettingsAppearance />;
      case "notifications":
        return <SettingsNotifications />;
      case "permissions":
        return <SettingsPermissions />;
      case "dictionary":
        return <SettingsDictionary />;
      case "dictation":
        return <SettingsDictation />;
      case "transcription":
        return <STT />;
      case "claude":
        return <SettingsClaude />;
      case "todo":
        return <SettingsTodo />;
      default:
        return <SettingsApp />;
    }
  };

  return (
    <div
      data-settings-content
      className="bg-card dark:bg-accent flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="relative min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <div
          className={cn([
            "scroll-fade-y scrollbar-hide h-full min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto px-6 pt-6 pb-10",
          ])}
        >
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
