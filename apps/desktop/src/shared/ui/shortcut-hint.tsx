import type { ReactNode } from "react";

import { Kbd, KbdGroup } from "@anlg/ui/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipShortcut,
  TooltipTrigger,
} from "@anlg/ui/components/ui/tooltip";

import { type ShortcutKey, shortcutLabels } from "~/shared/shortcut-keys";

export function ShortcutKeys({
  keys,
  className,
}: {
  keys: readonly ShortcutKey[];
  className?: string;
}) {
  return (
    <KbdGroup className={className}>
      {shortcutLabels(keys).map((label) => (
        <Kbd key={label}>{label}</Kbd>
      ))}
    </KbdGroup>
  );
}

export function ShortcutHint({
  label,
  keys,
  side = "bottom",
  children,
}: {
  label: string;
  keys?: readonly ShortcutKey[];
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <span>{label}</span>
        {keys && keys.length > 0 ? (
          <TooltipShortcut>{shortcutLabels(keys).join("")}</TooltipShortcut>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
