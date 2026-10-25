import { getIdentifier } from "@tauri-apps/api/app";

import { DesktopScheme } from "~/shared/enums";

// export * from "../shared/config/configure-pro-settings";
// export * from "~/sidebar/timeline/utils";
// export * from "~/stt/segment";

export const id = () => crypto.randomUUID() as string;

export { DesktopScheme };

export const getScheme = async (): Promise<DesktopScheme> => {
  const id = await getIdentifier();
  const schemes: Record<string, DesktopScheme> = {
    "com.hyprnote.stable": DesktopScheme.Cue,
    "com.hyprnote.Hyprnote": DesktopScheme.Cue,
    "com.hyprnote.staging": DesktopScheme.CueStaging,
    "com.hyprnote.nightly": DesktopScheme.CueNightly,
    "com.hyprnote.dev": DesktopScheme.CueDev,
    "so.anarlog.Anarlog": DesktopScheme.Cue,
    "com.anarlog.stable": DesktopScheme.Cue,
    "com.anarlog.staging": DesktopScheme.CueStaging,
    "com.anarlog.dev": DesktopScheme.CueDev,
  };
  return schemes[id] ?? DesktopScheme.Cue;
};

// https://www.rfc-editor.org/rfc/rfc4122#section-4.1.7
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";
