import * as SwitchPrimitives from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6: off is foreground/45 (3.3:1), on is the strong amber step.
const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn([
      "peer inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5",
      "transition-[background-color] duration-150",
      "data-[state=unchecked]:bg-foreground/45 data-[state=checked]:bg-warm-strong dark:data-[state=checked]:bg-warm",
      "disabled:pointer-events-none disabled:opacity-40",
      className,
    ])}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn([
        "pointer-events-none block size-4 rounded-full bg-white shadow-sm",
        "transition-transform duration-150 ease-(--ease-standard)",
        "data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4",
      ])}
    />
  </SwitchPrimitives.Root>
));
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
