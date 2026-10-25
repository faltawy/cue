import { TabContentEmpty } from "./empty";

import { MainTabContent } from "~/shared/main/tab-content";
import { type Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function ClassicMainTabContent({ tab }: { tab: Tab }) {
  if (tab.type === TabType.Empty) {
    return <TabContentEmpty tab={tab} />;
  }

  return <MainTabContent tab={tab} />;
}
