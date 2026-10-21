import { getIdentifier } from "@tauri-apps/api/app";

// export * from "../shared/config/configure-pro-settings";
// export * from "~/sidebar/timeline/utils";
// export * from "~/stt/segment";

export const id = () => crypto.randomUUID() as string;

export type DesktopScheme = "cue" | "cue-staging" | "cue-nightly" | "cue-dev";

export const getScheme = async (): Promise<DesktopScheme> => {
  const id = await getIdentifier();
  const schemes: Record<string, DesktopScheme> = {
    "com.hyprnote.stable": "cue",
    "com.hyprnote.Hyprnote": "cue",
    "com.hyprnote.staging": "cue-staging",
    "com.hyprnote.nightly": "cue-nightly",
    "com.hyprnote.dev": "cue-dev",
    "so.anarlog.Anarlog": "cue",
    "com.anarlog.stable": "cue",
    "com.anarlog.staging": "cue-staging",
    "com.anarlog.dev": "cue-dev",
  };
  return schemes[id] ?? "cue";
};

// https://www.rfc-editor.org/rfc/rfc4122#section-4.1.7
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";
