import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@anlg/utils";

// Coach suggestion chip (apps/coach/src/ui/components/composer.tsx).
export const chipClassName = cn([
  "border-border text-label text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 whitespace-nowrap",
  "hover:bg-muted hover:text-foreground active:bg-accent transition-[background-color,color] duration-100",
  "aria-pressed:bg-muted aria-pressed:text-foreground disabled:pointer-events-none disabled:opacity-40",
  "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3",
]);

const Chip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }
>(({ className, asChild = false, type = "button", ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      className={cn([chipClassName, className])}
      {...props}
    />
  );
});
Chip.displayName = "Chip";

export { Chip };
