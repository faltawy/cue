import type { ReactNode } from "react";

import { Kbd, KbdGroup } from "@anlg/ui/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
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
        <Kbd key={label} className="h-4 min-w-4 px-1 text-[10px] shadow-none">
          {label}
        </Kbd>
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
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{label}</span>
        {keys && keys.length > 0 ? <ShortcutKeys keys={keys} /> : null}
      </TooltipContent>
    </Tooltip>
  );
}
