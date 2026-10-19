import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6: a native radio (arrow keys and grouping come from `name`),
// drawn like the checkbox: size-3.5, border-input, primary fill when checked
// with a dot in the primary foreground.
const Radio = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <span
    className={cn([
      "relative inline-grid size-3.5 shrink-0 place-items-center",
      className,
    ])}
  >
    <input
      ref={ref}
      type="radio"
      className={cn([
        "peer border-input bg-background col-start-1 row-start-1 m-0 size-3.5 cursor-pointer appearance-none rounded-full border",
        "transition-[background-color,border-color] duration-100",
        "checked:border-primary checked:bg-primary",
        "disabled:pointer-events-none disabled:opacity-40",
      ])}
      {...props}
    />
    <span
      aria-hidden
      className="bg-primary-foreground pointer-events-none col-start-1 row-start-1 size-1.5 rounded-full opacity-0 peer-checked:opacity-100 peer-disabled:opacity-40"
    />
  </span>
));
Radio.displayName = "Radio";

export { Radio };
