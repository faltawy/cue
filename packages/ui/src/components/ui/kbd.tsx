import { cn } from "@anlg/utils";

// Coach `Kbd` (apps/coach/src/ui/components/primitives.tsx): flat, 10.5px.
// Shortcuts read left to right (⌘N) in every writing direction.
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      dir="ltr"
      className={cn([
        "pointer-events-none inline-flex min-w-[1.35em] shrink-0 items-center justify-center gap-0.5 px-1 whitespace-nowrap select-none",
        "border-border bg-background rounded-sm border",
        "text-muted-foreground font-sans text-[10.5px] leading-[1.5] font-medium tabular-nums",
        "[&_svg:not([class*='size-'])]:size-2.5",
        className,
      ])}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      dir="ltr"
      className={cn(["inline-flex items-center gap-0.5", className])}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
