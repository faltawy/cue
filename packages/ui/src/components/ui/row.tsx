import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6: one-line list and sidebar rows. The fills are foreground tints,
// so they read the same on the page and on the sidebar: hover is a faint
// wash, selected a clearly stronger one plus primary text at medium weight.
export const ROW_HOVER = "hover:bg-foreground/[0.04]";
export const ROW_SELECTED = "bg-foreground/[0.08] text-foreground font-medium";

export function rowClassName({
  selected = false,
}: { selected?: boolean } = {}) {
  return cn([
    "text-ui flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start select-none",
    "transition-[background-color,color] duration-100 focus-visible:-outline-offset-2",
    "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
    selected
      ? ROW_SELECTED
      : [
          ROW_HOVER,
          "[&_svg:not([class*='text-'])]:text-muted-foreground hover:[&_svg:not([class*='text-'])]:text-foreground",
        ],
  ]);
}

const ListRow = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    selected?: boolean;
  }
>(
  (
    { className, asChild = false, selected, type = "button", ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-current={selected || undefined}
        className={cn([rowClassName({ selected }), className])}
        {...props}
      />
    );
  },
);
ListRow.displayName = "ListRow";

export { ListRow };
