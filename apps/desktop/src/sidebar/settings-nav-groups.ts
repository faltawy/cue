import { useLingui } from "@lingui/react/macro";

import {
  Bell,
  BookOpen,
  CalendarDots,
  FileText,
  FolderSimple,
  Gear,
  type Icon,
  Lock,
  Microphone,
  Sparkle,
  Sun,
  Users,
  VideoCamera,
  Waveform,
} from "@anlg/ui/components/icons";

import { SettingsNavigationGroup } from "~/sidebar/enums";
import { type TabInput } from "~/store/zustand/tabs";
import { SettingsTab } from "~/store/zustand/tabs/enums";

type SettingsNavItem =
  | {
      id: SettingsTab;
      label: string;
      icon: Icon;
    }
  | {
      id: SettingsNavigationGroup;
      label: string;
      icon: Icon;
      destination: TabInput;
    };

export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

export function useSettingsNavGroups(): SettingsNavGroup[] {
  const { t } = useLingui();

  return [
    {
      label: t`Setup`,
      items: [
        { id: SettingsTab.Claude, label: t`AI`, icon: Sparkle },
        {
          id: SettingsTab.Transcription,
          label: t`Transcription`,
          icon: Waveform,
        },
        { id: SettingsTab.Permissions, label: t`Permissions`, icon: Lock },
        { id: SettingsTab.Dictation, label: t`Dictation`, icon: Microphone },
      ],
    },
    {
      label: t`Meeting capture`,
      items: [
        { id: SettingsTab.Meetings, label: t`Meetings`, icon: VideoCamera },
        {
          id: SettingsNavigationGroup.Calendar,
          label: t`Calendar`,
          icon: CalendarDots,
          destination: { type: "calendar" },
        },
        { id: SettingsTab.Notifications, label: t`Notifications`, icon: Bell },
      ],
    },
    {
      label: t`Library`,
      items: [
        {
          id: SettingsNavigationGroup.Folders,
          label: t`Folders`,
          icon: FolderSimple,
          destination: { type: "folders" },
        },
        {
          id: SettingsNavigationGroup.Contacts,
          label: t`Contacts`,
          icon: Users,
          destination: { type: "contacts" },
        },
        {
          id: SettingsNavigationGroup.Templates,
          label: t`Templates`,
          icon: FileText,
          destination: { type: "templates" },
        },
        { id: SettingsTab.Dictionary, label: t`Dictionary`, icon: BookOpen },
      ],
    },
    {
      label: t`Appearance & general`,
      items: [
        { id: SettingsTab.Appearance, label: t`Appearance`, icon: Sun },
        { id: SettingsTab.App, label: t`General`, icon: Gear },
      ],
    },
  ];
}
