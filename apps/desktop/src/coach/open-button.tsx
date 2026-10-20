import { useLingui } from "@lingui/react/macro";

import { commands as coachCommands } from "@anlg/plugin-coach";
import { Sparkle } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";

import { useConfigValue } from "~/shared/config";
import { acceleratorKeys } from "~/shared/shortcut-keys";
import { ShortcutHint } from "~/shared/ui/shortcut-hint";
import { useListener } from "~/stt/contexts";

async function showCoach() {
  const result = await coachCommands.show();
  if (result.status === "error") {
    console.error("[coach] failed to open", result.error);
  }
}

export function CoachButton({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const shortcut = useConfigValue("coach_shortcut");
  if (sessionMode !== "active" && sessionMode !== "finalizing") {
    return null;
  }

  const label = t`Open coach`;
  return (
    <ShortcutHint label={label} keys={acceleratorKeys(shortcut)}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        data-tauri-drag-region="false"
        aria-label={label}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => void showCoach()}
      >
        <Sparkle className="size-4" />
      </Button>
    </ShortcutHint>
  );
}
