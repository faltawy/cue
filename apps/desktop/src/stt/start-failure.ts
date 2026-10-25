import {
  commands as permissionsCommands,
  type PermissionStatus,
} from "@anlg/plugin-permissions";
import { toast } from "@anlg/ui/components/ui/toast";

import { SettingsTab } from "~/store/zustand/tabs/enums";
import { StartFailureStage, StartFailureKind } from "~/stt/enums";

export { StartFailureStage };

export { StartFailureKind };

const START_FAILURE_TOAST_ID = "capture-start-failed";

export function classifyStartFailure({
  stage,
  error,
  microphonePermission,
}: {
  stage: StartFailureStage;
  error: string | null;
  microphonePermission: PermissionStatus | null;
}): StartFailureKind {
  if (stage === StartFailureStage.RecoveryMarker) {
    return StartFailureKind.Storage;
  }
  if (error?.includes("session already running")) {
    return StartFailureKind.AlreadyRunning;
  }
  if (error?.includes("session storage unavailable")) {
    return StartFailureKind.Storage;
  }
  if (microphonePermission && microphonePermission !== "authorized") {
    return StartFailureKind.MicrophonePermission;
  }
  return StartFailureKind.Recorder;
}

export function describeStartFailure(kind: StartFailureKind): {
  title: string;
  description: string;
  action?: { label: string; tab: SettingsTab };
} {
  switch (kind) {
    case StartFailureKind.AlreadyRunning:
      return {
        title: "Another recording is still running",
        description:
          "Stop the current recording, or wait for it to finish saving, then try again.",
      };
    case StartFailureKind.Storage:
      return {
        title: "Cue couldn't prepare storage for this recording",
        description:
          "Check that your vault folder is available and your disk has free space, then try again.",
      };
    case StartFailureKind.MicrophonePermission:
      return {
        title: "Cue doesn't have microphone access",
        description: "Allow microphone access for Cue, then try again.",
        action: { label: "Open permissions", tab: SettingsTab.Permissions },
      };
    case StartFailureKind.Recorder:
      return {
        title: "Recording couldn't start",
        description:
          "Cue couldn't open your audio input. Check your microphone selection, then try again.",
        action: { label: "Audio settings", tab: SettingsTab.Meetings },
      };
  }
}

export async function getMicrophonePermission(): Promise<PermissionStatus | null> {
  try {
    const result = await permissionsCommands.checkPermission("microphone");
    return result.status === "ok" ? result.data : null;
  } catch {
    return null;
  }
}

export function showStartFailureToast(
  kind: StartFailureKind,
  openSettings: (tab: SettingsTab) => void,
) {
  const { title, description, action } = describeStartFailure(kind);
  toast.error(title, {
    id: START_FAILURE_TOAST_ID,
    description,
    ...(action
      ? {
          action: {
            label: action.label,
            onClick: () => openSettings(action.tab),
          },
        }
      : {}),
  });
}
