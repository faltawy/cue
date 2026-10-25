import { Trans } from "@lingui/react/macro";

import { StandardContentWrapper } from "~/shared/main";
import { type Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export function TabContentHuman({
  tab: _,
}: {
  tab: Extract<Tab, { type: TabType.Humans }>;
}) {
  return (
    <StandardContentWrapper>
      <div>
        <Trans>Human</Trans>
      </div>
    </StandardContentWrapper>
  );
}
