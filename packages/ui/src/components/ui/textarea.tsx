import * as React from "react";

import { cn } from "@anlg/utils";

import { fieldClassName } from "./input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn([
        fieldClassName,
        "text-body flex min-h-16 rounded-lg px-3 pt-2.5 pb-2 leading-[1.5]",
        className,
      ])}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
