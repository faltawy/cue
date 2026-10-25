import { lazy, Suspense } from "react";

import { type Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

const TabContentFolders = lazy(async () => ({
  default: (await import("~/folders")).TabContentFolders,
}));
const TabContentCalendar = lazy(async () => ({
  default: (await import("~/calendar")).TabContentCalendar,
}));
const TabContentChangelog = lazy(async () => ({
  default: (await import("~/changelog")).TabContentChangelog,
}));
const TabContentContact = lazy(async () => ({
  default: (await import("~/contacts")).TabContentContact,
}));
const TabContentHuman = lazy(async () => ({
  default: (await import("~/contacts/humans")).TabContentHuman,
}));
const TabContentNote = lazy(async () => ({
  default: (await import("~/session")).TabContentNote,
}));
const TabContentOnboarding = lazy(async () => ({
  default: (await import("~/onboarding")).TabContentOnboarding,
}));
const TabContentSettings = lazy(async () => ({
  default: (await import("~/settings")).TabContentSettings,
}));
const TabContentTask = lazy(async () => ({
  default: (await import("~/task")).TabContentTask,
}));
const TabContentTemplate = lazy(async () => ({
  default: (await import("~/templates")).TabContentTemplate,
}));

export function MainTabContent({ tab }: { tab: Tab }) {
  return (
    <Suspense fallback={null}>
      <LazyTabContent tab={tab} />
    </Suspense>
  );
}

function LazyTabContent({ tab }: { tab: Tab }) {
  if (tab.type === TabType.Folders) {
    return <TabContentFolders />;
  }
  if (tab.type === TabType.Sessions) {
    return <TabContentNote tab={tab} />;
  }
  if (tab.type === TabType.Humans) {
    return <TabContentHuman tab={tab} />;
  }
  if (tab.type === TabType.Contacts) {
    return <TabContentContact tab={tab} />;
  }
  if (tab.type === TabType.Calendar) {
    return <TabContentCalendar />;
  }
  if (tab.type === TabType.Changelog) {
    return <TabContentChangelog tab={tab} />;
  }
  if (tab.type === TabType.Settings) {
    return <TabContentSettings tab={tab} />;
  }
  if (tab.type === TabType.Templates) {
    return <TabContentTemplate tab={tab} />;
  }
  if (tab.type === TabType.Onboarding) {
    return <TabContentOnboarding tab={tab} />;
  }
  if (tab.type === TabType.Task) {
    return <TabContentTask tab={tab} />;
  }
  return null;
}
