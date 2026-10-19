import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6: one neutral badge; status is a dot, never a coloured fill.
const DOT_CLASS = {
  success: "bg-success",
  warning: "bg-warm",
  destructive: "bg-destructive",
  live: "bg-live",
  neutral: "bg-muted-foreground",
} as const;

export type BadgeTone = keyof typeof DOT_CLASS;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Adds a status dot before the label. */
  tone?: BadgeTone;
  disabled?: boolean;
  label?: string;
  ref?: React.Ref<HTMLSpanElement>;
}

function Badge({
  className,
  tone,
  disabled,
  label,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      data-slot="badge"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn([
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 whitespace-nowrap",
        "border-border text-label text-muted-foreground font-medium",
        "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
        disabled && "pointer-events-none opacity-50",
        className,
      ])}
      {...props}
    >
      {tone ? (
        <span
          aria-hidden
          className={cn(["size-1.5 shrink-0 rounded-full", DOT_CLASS[tone]])}
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge };
