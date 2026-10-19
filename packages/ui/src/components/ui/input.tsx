import * as React from "react";

import { cn } from "@anlg/utils";

// Text fields show focus with their border (coach composer), not an outline.
export const fieldClassName = cn([
  "border-input bg-background text-foreground w-full min-w-0 rounded-md border",
  "placeholder:text-tertiary-foreground caret-warm-strong",
  "focus:border-foreground transition-[border-color] duration-150 focus-visible:outline-none",
  "aria-invalid:border-destructive disabled:pointer-events-none disabled:opacity-50",
]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn([
          fieldClassName,
          "text-body flex h-8 px-2.5",
          "file:text-foreground file:text-ui file:me-2 file:border-0 file:bg-transparent file:font-medium",
          className,
        ])}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
