import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

import { Sparkle } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";

import { showCoach } from "~/coach/commands";
import { useCoachNudges } from "~/coach/nudges";
import { useConfigValue } from "~/shared/config";
import { acceleratorKeys } from "~/shared/shortcut-keys";
import { ShortcutHint } from "~/shared/ui/shortcut-hint";
import { LiveSessionStatus } from "~/store/zustand/listener/enums";
import { useListener } from "~/stt/contexts";

export function CoachStrip({ sessionId }: { sessionId: string }) {
  const { t } = useLingui();
  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const shortcut = useConfigValue("coach_shortcut");
  const unseen = useCoachNudges((state) => state.unseen.includes(sessionId));
  const nudges = useCoachNudges((state) => state.counts[sessionId] ?? 0);
  if (
    sessionMode !== LiveSessionStatus.Active &&
    sessionMode !== LiveSessionStatus.Finalizing
  ) {
    return null;
  }

  return (
    <ShortcutHint label={t`Open coach`} keys={acceleratorKeys(shortcut)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        data-tauri-drag-region="false"
        className="text-muted-foreground hover:text-foreground shrink-0 gap-1.5 whitespace-nowrap"
        onClick={() => void showCoach()}
      >
        <span className="relative flex">
          <Sparkle className="size-3.5" />
          {unseen && (
            <span
              aria-hidden
              className="ring-background bg-warm pointer-events-none absolute -end-0.5 -top-0.5 size-1.5 rounded-full ring-2"
            />
          )}
        </span>
        <span className="tabular-nums">
          {plural(nudges, {
            0: "Coach is listening",
            one: "Coach is listening · # nudge",
            other: "Coach is listening · # nudges",
          })}
          {unseen && (
            <span className="sr-only">
              , <Trans>new nudge</Trans>
            </span>
          )}
        </span>
      </Button>
    </ShortcutHint>
  );
}
