import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

import { rowClassName } from "@anlg/ui/components/ui/row";

import { CustomSidebarHeader } from "./custom-sidebar-header";
import { useSettingsNavGroups } from "./settings-nav-groups";

import { SidebarSearchField } from "~/sidebar/search-field";
import { type SettingsTab, useTabs } from "~/store/zustand/tabs";

export function SettingsNav() {
  const { t } = useLingui();
  const groups = useSettingsNavGroups();
  const [search, setSearch] = useState("");
  const currentTab = useTabs((state) => state.currentTab);
  const updateSettingsTabState = useTabs(
    (state) => state.updateSettingsTabState,
  );
  const openNew = useTabs((state) => state.openNew);

  const requestedTab =
    currentTab?.type === "settings" ? (currentTab.state.tab ?? "app") : "app";
  const activeTab = requestedTab === "audio" ? "meetings" : requestedTab;

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      if (currentTab?.type === "settings") {
        updateSettingsTabState(currentTab, { tab });
      }
    },
    [currentTab, updateSettingsTabState],
  );

  const query = search.trim().toLowerCase();
  const visibleGroups = query
    ? groups
        .map((group) =>
          group.label.toLowerCase().includes(query)
            ? group
            : {
                ...group,
                items: group.items.filter((item) =>
                  item.label.toLowerCase().includes(query),
                ),
              },
        )
        .filter((group) => group.items.length > 0)
    : groups;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <CustomSidebarHeader />
      <SidebarSearchField
        value={search}
        onChange={setSearch}
        placeholder={t`Search settings...`}
      />
      <div className="scrollbar-hide flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 pb-6">
          {visibleGroups.length === 0 ? (
            <div className="text-muted-foreground px-3 py-8 text-center">
              <p className="text-ui">
                <Trans>No results found.</Trans>
              </p>
            </div>
          ) : null}
          {visibleGroups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-label px-2 pb-1 font-medium">
                {group.label}
              </span>
              {group.items.map((item) => (
                <div key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if ("destination" in item) {
                        openNew(item.destination);
                        return;
                      }

                      setActiveTab(item.id);
                    }}
                    aria-current={activeTab === item.id ? "page" : undefined}
                    className={rowClassName({
                      selected: activeTab === item.id,
                    })}
                  >
                    <item.icon
                      className="size-3.5 shrink-0"
                      data-testid={`settings-nav-icon-${item.id}`}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {item.label}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
