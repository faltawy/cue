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

import { type SettingsTab, type TabInput } from "~/store/zustand/tabs";

type SettingsNavItem =
  | {
      id: SettingsTab;
      label: string;
      icon: Icon;
    }
  | {
      id: "calendar" | "contacts" | "folders" | "templates";
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
        { id: "claude", label: t`AI`, icon: Sparkle },
        { id: "transcription", label: t`Transcription`, icon: Waveform },
        { id: "permissions", label: t`Permissions`, icon: Lock },
        { id: "dictation", label: t`Dictation`, icon: Microphone },
      ],
    },
    {
      label: t`Meeting capture`,
      items: [
        { id: "meetings", label: t`Meetings`, icon: VideoCamera },
        {
          id: "calendar",
          label: t`Calendar`,
          icon: CalendarDots,
          destination: { type: "calendar" },
        },
        { id: "notifications", label: t`Notifications`, icon: Bell },
      ],
    },
    {
      label: t`Library`,
      items: [
        {
          id: "folders",
          label: t`Folders`,
          icon: FolderSimple,
          destination: { type: "folders" },
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
        { id: "dictionary", label: t`Dictionary`, icon: BookOpen },
      ],
    },
    {
      label: t`Appearance & general`,
      items: [
        { id: "appearance", label: t`Appearance`, icon: Sun },
        { id: "app", label: t`General`, icon: Gear },
      ],
    },
  ];
}
