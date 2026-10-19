// One surface for every floating layer: menus, selects, popovers and command
// lists (docs/design/cue.md §6). Items sit 4px inside the 8px container.
export const floatingSurfaceClassName =
  "bg-popover text-popover-foreground border-border rounded-lg border shadow-lg outline-hidden";

export const floatingMotionClassName =
  "data-[state=open]:animate-enter data-[state=closed]:animate-exit";

export const menuItemClassName = [
  "relative flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-ui outline-hidden select-none",
  "data-highlighted:bg-muted data-[state=open]:bg-muted",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  "[&_svg:not([class*='text-'])]:text-muted-foreground data-highlighted:[&_svg:not([class*='text-'])]:text-foreground",
].join(" ");

// Radix marks disabled items with a bare `data-disabled`; cmdk writes
// `data-disabled="false"` on every item, so Command keeps its own rule.
export const menuItemDisabledClassName =
  "data-disabled:pointer-events-none data-disabled:opacity-40";

export const menuDestructiveItemClassName =
  "text-destructive data-highlighted:bg-destructive/10 [&_svg:not([class*='text-'])]:text-destructive data-highlighted:[&_svg:not([class*='text-'])]:text-destructive";

export const menuLabelClassName =
  "text-label text-muted-foreground px-2 pt-1.5 pb-1 font-medium";

export const menuSeparatorClassName = "bg-border -mx-1 my-1 h-px";
