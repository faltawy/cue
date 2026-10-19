import { Trans } from "@lingui/react/macro";

import { ShortcutRecorder } from "./shortcut-recorder";

import { waitForDictationCleanup } from "~/dictation/lifecycle";
import { useDictationStatus } from "~/dictation/state";
import { setSettingValue } from "~/settings/queries";

export function DictationShortcut({ shortcut }: { shortcut: string }) {
  return (
    <ShortcutRecorder
      id="dictation-shortcut"
      label={<Trans>Dictation shortcut</Trans>}
      shortcut={shortcut}
      save={(value) => setSettingValue("dictation_shortcut", value)}
      prepare={waitForDictationCleanup}
      onRecordingChange={(capturingShortcut) =>
        useDictationStatus.setState({ capturingShortcut })
      }
      nativeKeys
    />
  );
}
