import { useLingui } from "@lingui/react/macro";

import {
  Bell,
  BookOpen,
  CalendarDots,
  FileText,
  FolderSimple,
  Gear,
  Lightning,
  type Icon,
  Lock,
  Microphone,
  Sparkle,
  Sun,
  Users,
  VideoCamera,
  Waveform,
} from "@anlg/ui/components/icons";

import { type SettingsTab, type TabInput } from "~/store/zustand/tabs";

type SettingsNavItem =
  | {
      id: SettingsTab;
      label: string;
      icon: Icon;
    }
  | {
      id: "automations" | "calendar" | "contacts" | "folders" | "templates";
      label: string;
      icon: Icon;
      destination: TabInput;
    };

export type SettingsNavGroup = { label: string; items: SettingsNavItem[] };

export function useSettingsNavGroups(): SettingsNavGroup[] {
  const { t } = useLingui();

  return [
    {
      label: t`App`,
      items: [
        { id: "app", label: t`General`, icon: Gear },
        { id: "claude", label: t`Claude`, icon: Sparkle },
        { id: "appearance", label: t`Appearance`, icon: Sun },
        { id: "notifications", label: t`Notifications`, icon: Bell },
      ],
    },
    {
      label: "AI",
      items: [
        { id: "transcription", label: t`Transcription`, icon: Waveform },
        { id: "dictionary", label: t`Dictionary`, icon: BookOpen },
      ],
    },
    {
      label: t`Workspace`,
      items: [
        { id: "meetings", label: t`Meetings`, icon: VideoCamera },
        {
          id: "folders",
          label: t`Folders`,
          icon: FolderSimple,
          destination: { type: "folders" },
        },
        {
          id: "calendar",
          label: t`Calendar`,
          icon: CalendarDots,
          destination: { type: "calendar" },
        },
        {
          id: "contacts",
          label: t`Contacts`,
          icon: Users,
          destination: { type: "contacts" },
        },
        {
          id: "templates",
          label: t`Templates`,
          icon: FileText,
          destination: { type: "templates" },
        },
      ],
    },
    {
      label: t`Advanced`,
      items: [
        { id: "dictation", label: t`Dictation`, icon: Microphone },
        {
          id: "automations",
          label: t`Automations`,
          icon: Lightning,
          destination: { type: "automations" },
        },
        { id: "permissions", label: t`Permissions`, icon: Lock },
      ],
    },
  ];
}
