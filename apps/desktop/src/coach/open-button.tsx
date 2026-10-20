import { useLingui } from "@lingui/react/macro";

import { commands as coachCommands } from "@anlg/plugin-coach";
import { Sparkle } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";

import { useCoachNudges } from "~/coach/nudges";
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
  const nudged = useCoachNudges((state) => state.sessions.includes(sessionId));
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
        aria-label={nudged ? t`Open coach, new nudge` : label}
        className="text-muted-foreground hover:text-foreground relative"
        onClick={() => void showCoach()}
      >
        <Sparkle className="size-4" />
        {nudged && (
          <span
            aria-hidden
            className="ring-background bg-warm pointer-events-none absolute end-1 top-1 size-1.5 rounded-full ring-2"
          />
        )}
      </Button>
    </ShortcutHint>
  );
}
