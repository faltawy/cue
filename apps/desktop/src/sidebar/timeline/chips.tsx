import type { ReactNode } from "react";

import { ArrowDown, ArrowUp, Sun } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { floatingChipClassName } from "@anlg/ui/components/ui/floating-content";
import { cn } from "@anlg/utils";

export function UpcomingMeetingChip({
  ariaLabel,
  label,
  onClick,
}: {
  ariaLabel: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <TimelineTopChip
      aria-live="polite"
      ariaLabel={ariaLabel}
      data-sidebar-upcoming-meeting-status
      className={cn([floatingChipClassName, "w-28 justify-center"])}
      icon={<ArrowUp aria-hidden className="size-3" />}
      onClick={onClick}
    >
      {label}
    </TimelineTopChip>
  );
}

export function TimelineTopChip({
  ariaLabel,
  children,
  icon,
  onClick,
  ...props
}: {
  ariaLabel?: string;
  children: ReactNode;
  icon: ReactNode;
  className?: string;
  role?: string;
  "aria-live"?: "off" | "polite" | "assertive";
  "data-sidebar-upcoming-meeting-status"?: true;
  onClick?: () => void;
}) {
  const className = cn([
    floatingChipClassName,
    "text-muted-foreground text-label flex h-6 items-center gap-1 px-2.5 font-medium",
    onClick &&
      "hover:bg-muted hover:text-foreground transition-colors duration-100",
    props.className,
  ]);

  if (onClick) {
    return (
      <Button
        {...props}
        aria-label={ariaLabel}
        className={className}
        onClick={onClick}
        size="sm"
        variant="outline"
      >
        <span className="flex size-3 shrink-0 items-center justify-center">
          {icon}
        </span>
        <span className="truncate">{children}</span>
      </Button>
    );
  }

  return (
    <div {...props} aria-label={ariaLabel} className={className}>
      <span className="flex size-3 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </div>
  );
}

export function TimelineNowChip({
  ariaLabel,
  children,
  className,
  direction,
  onClick,
}: {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  direction: "up" | "down";
  onClick: () => void;
}) {
  const DirectionIcon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn([
        floatingChipClassName,
        "text-label flex h-6 items-center gap-1 px-2.5 font-medium",
        "hover:bg-muted transition-colors duration-100",
        className,
      ])}
      onClick={onClick}
    >
      {direction === "up" ? <DirectionIcon className="size-3" /> : null}
      <Sun className="text-warm-strong size-3 shrink-0" />
      <span>{children}</span>
      {direction === "down" ? <DirectionIcon className="size-3" /> : null}
    </button>
  );
}
