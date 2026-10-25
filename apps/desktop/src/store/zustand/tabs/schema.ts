import type {
  ChangelogState,
  ContactsState,
  EditorView as NativeEditorView,
  SessionsState as WindowsSessionsState,
  TabInput as WindowsTabInput,
  TemplatesState,
} from "@anlg/plugin-windows";
import {
  SessionNoteViewType,
  type SessionNoteView as EditorView,
} from "@anlg/utils/session";

import {
  TabType,
  TaskResourceType,
  SettingsTab,
  SessionInitialTab,
} from "~/store/zustand/tabs/enums";

export type { EditorView };

type SessionInputState = WindowsSessionsState & {
  scheduledAutoStart?: boolean | null;
};

export type SessionsState = Omit<SessionInputState, "view"> & {
  view: EditorView | null;
};

type WindowsSupportedWindowTabInput = Exclude<
  WindowsTabInput,
  { type: "extension" } | { type: "extensions" } | { type: "folders" }
>;

export type SupportedWindowTabInput =
  | Exclude<WindowsSupportedWindowTabInput, { type: "sessions" }>
  | (Omit<
      Extract<WindowsSupportedWindowTabInput, { type: "sessions" }>,
      "state"
    > & {
      state?: SessionInputState | null;
    });

export type TabInput = SupportedWindowTabInput | { type: "folders" };

export const isTabInputSupported = (
  tab: WindowsTabInput,
): tab is SupportedWindowTabInput => {
  return (
    tab.type !== "extension" &&
    tab.type !== "extensions" &&
    tab.type !== "folders"
  );
};

export { SettingsTab };

const normalizeSettingsTab = (tab: string | null | undefined): SettingsTab => {
  switch (tab) {
    case SettingsTab.App:
    case SettingsTab.Meetings:
    case SettingsTab.Appearance:
    case SettingsTab.Notifications:
    case SettingsTab.Permissions:
    case SettingsTab.Dictionary:
    case SettingsTab.Dictation:
    case SettingsTab.Transcription:
    case SettingsTab.Claude:
    case SettingsTab.Todo:
      return tab;
    case "intelligence":
      return SettingsTab.Claude;
    case "audio":
      return SettingsTab.Meetings;
    case "personalization":
      return SettingsTab.Dictionary;
    default:
      return SettingsTab.App;
  }
};

type SettingsState = {
  tab: SettingsTab | null;
};

type DailySummaryState = {
  activeTab: SessionInitialTab | null;
};

type BaseTab = {
  active: boolean;
  slotId: string;
  pinned: boolean;
  returnToSlotId?: string;
  returnToTabId?: string;
};

export type Tab =
  | (BaseTab & {
      type: TabType.Sessions;
      id: string;
      state: SessionsState;
    })
  | (BaseTab & {
      type: TabType.Contacts;
      state: ContactsState;
    })
  | (BaseTab & {
      type: TabType.Templates;
      state: TemplatesState;
    })
  | (BaseTab & { type: TabType.Folders })
  | (BaseTab & {
      type: TabType.Humans;
      id: string;
    })
  | (BaseTab & { type: TabType.Organizations; id: string })
  | (BaseTab & { type: TabType.Empty })
  | (BaseTab & { type: TabType.Calendar })
  | (BaseTab & {
      type: TabType.Changelog;
      state: ChangelogState;
    })
  | (BaseTab & { type: TabType.Settings; state: SettingsState })
  | (BaseTab & { type: TabType.Onboarding })
  | (BaseTab & {
      type: TabType.Task;
      id: string;
      resources: TaskResource[];
    })
  | (BaseTab & {
      type: TabType.DailySummary;
      id: string;
      state: DailySummaryState;
    });

export type TaskResource =
  | {
      type: TaskResourceType.GithubIssue;
      owner: string;
      repo: string;
      number: number;
    }
  | {
      type: TaskResourceType.GithubPr;
      owner: string;
      repo: string;
      number: number;
    };

function normalizeEditorView(view: NativeEditorView | null): EditorView | null {
  if (!view) return null;
  switch (view.type) {
    case "raw":
      return { type: SessionNoteViewType.Raw };
    case "transcript":
      return { type: SessionNoteViewType.Transcript };
    case "attachments":
      return { type: SessionNoteViewType.Attachments };
    case "enhanced":
      return { type: SessionNoteViewType.Enhanced, id: view.id };
  }
}

export const getDefaultState = (tab: TabInput): Tab => {
  const base = { active: false, slotId: "", pinned: false };

  switch (tab.type) {
    case "sessions":
      return {
        ...base,
        type: TabType.Sessions,
        id: tab.id,
        state: tab.state
          ? {
              ...tab.state,
              view: normalizeEditorView(tab.state.view),
              scheduledAutoStart: tab.state.scheduledAutoStart ?? null,
            }
          : {
              view: null,
              autoStart: null,
              scheduledAutoStart: null,
            },
      };
    case "contacts":
      return {
        ...base,
        type: TabType.Contacts,
        state: tab.state ?? {
          selected: null,
        },
      };
    case "templates":
      return {
        ...base,
        type: TabType.Templates,
        state: tab.state ?? {
          showHomepage: false,
          isWebMode: true,
          selectedMineId: null,
          selectedWebIndex: null,
        },
      };
    case "folders":
      return { ...base, type: TabType.Folders };
    case "humans":
      return { ...base, type: TabType.Humans, id: tab.id };
    case "organizations":
      return { ...base, type: TabType.Organizations, id: tab.id };
    case "empty":
      return { ...base, type: TabType.Empty };
    case "calendar":
      return { ...base, type: TabType.Calendar };
    case "changelog":
      return {
        ...base,
        type: TabType.Changelog,
        state: tab.state,
      };
    case "settings": {
      const subtab = tab.state?.tab as string | null | undefined;
      if (subtab === "calendar") {
        return { ...base, type: TabType.Calendar };
      }
      if (subtab === "folders") {
        return { ...base, type: TabType.Folders };
      }
      return {
        ...base,
        type: TabType.Settings,
        state: {
          tab: normalizeSettingsTab(subtab),
        },
      };
    }
    case "onboarding":
      return { ...base, type: TabType.Onboarding };
    default:
      const _exhaustive: never = tab;
      return _exhaustive;
  }
};

export const uniqueIdfromTab = (tab: Tab): string => {
  switch (tab.type) {
    case TabType.Sessions:
      return `sessions-${tab.id}`;
    case TabType.Humans:
      return `humans-${tab.id}`;
    case TabType.Organizations:
      return `organizations-${tab.id}`;
    case TabType.Contacts:
      return `contacts`;
    case TabType.Templates:
      return `templates`;
    case TabType.Folders:
      return `folders`;
    case TabType.Empty:
      return `empty-${tab.slotId}`;
    case TabType.Calendar:
      return `calendar`;
    case TabType.Changelog:
      return "changelog";
    case TabType.Settings:
      return `settings`;
    case TabType.Onboarding:
      return `onboarding`;
    case TabType.Task:
      return `task-${tab.id}`;
    case TabType.DailySummary:
      return `daily_summary-${tab.id}`;
  }
};

export const isSameTab = (a: Tab, b: Tab) => {
  return uniqueIdfromTab(a) === uniqueIdfromTab(b);
};
