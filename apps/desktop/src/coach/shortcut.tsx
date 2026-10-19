import { Trans } from "@lingui/react/macro";
import { useEffect } from "react";

import { commands as shortcuts } from "@anlg/plugin-shortcut";

import { setSettingValue } from "~/settings/queries";
import { ShortcutRecorder } from "~/settings/shortcut-recorder";
import { useConfigValue } from "~/shared/config";

let registration = Promise.resolve();

// Registrations are serialized so a quick change cannot unregister the new key.
function configure(shortcut: string | null) {
  registration = registration.then(async () => {
    const result = await shortcuts.configureCoach(shortcut);
    if (result.status === "error") {
      console.error("[coach] failed to register the shortcut", result.error);
    }
  });
}

export function CoachShortcutLifecycle() {
  const shortcut = useConfigValue("coach_shortcut");
  useEffect(() => {
    configure(shortcut || null);
    return () => configure(null);
  }, [shortcut]);
  return null;
}

export function CoachShortcut() {
  const shortcut = useConfigValue("coach_shortcut");
  return (
    <ShortcutRecorder
      id="coach-shortcut"
      label={<Trans>Coach shortcut</Trans>}
      shortcut={shortcut}
      save={async (value) => {
        const result = await shortcuts.configureCoach(value);
        if (result.status === "error") throw new Error(result.error);
        await setSettingValue("coach_shortcut", value);
      }}
    />
  );
}
