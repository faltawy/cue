import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6: one-line list and sidebar rows. Selected rows keep the hover
// fill and add weight, because the fill alone is only ~1.1:1.
export function rowClassName({
  selected = false,
  surface = "background",
}: {
  selected?: boolean;
  surface?: "background" | "sidebar";
} = {}) {
  const fill = surface === "sidebar" ? "bg-sidebar-accent" : "bg-muted";
  return cn([
    "text-ui flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start select-none",
    "transition-[background-color,color] duration-100 focus-visible:-outline-offset-2",
    "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
    surface === "sidebar" ? "hover:bg-sidebar-accent" : "hover:bg-muted",
    selected
      ? [fill, "text-foreground font-medium"]
      : "[&_svg:not([class*='text-'])]:text-muted-foreground hover:[&_svg:not([class*='text-'])]:text-foreground",
  ]);
}

const ListRow = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    selected?: boolean;
    surface?: "background" | "sidebar";
  }
>(
  (
    {
      className,
      asChild = false,
      selected,
      surface,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        aria-current={selected || undefined}
        className={cn([rowClassName({ selected, surface }), className])}
        {...props}
      />
    );
  },
);
ListRow.displayName = "ListRow";

export { ListRow };
