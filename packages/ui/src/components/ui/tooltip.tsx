"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@anlg/utils";

// Coach tooltip (apps/coach/src/ui/components/primitives.tsx): dark chip,
// 500ms open delay, 100ms fade, 6px from the trigger.
function TooltipProvider({
  delayDuration = 500,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(
  (
    { className, sideOffset = 6, side = "top", collisionPadding = 8, ...props },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        side={side}
        collisionPadding={collisionPadding}
        asChild
        {...props}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className={cn([tooltipSurfaceClassName, "z-50 max-w-64", className])}
        >
          {props.children}
        </motion.div>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// Also used by hints that are not Radix tooltips (the meeting countdown).
export const tooltipSurfaceClassName =
  "flex items-center gap-1.5 rounded-md px-2 py-1 bg-primary text-primary-foreground text-caption font-medium shadow-lg";

/** The shortcut half of a tooltip label, as in the coach: `Search ⌘K`. */
function TooltipShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      dir="ltr"
      className={cn(["text-primary-foreground/60 tabular-nums", className])}
      {...props}
    />
  );
}

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipShortcut,
  TooltipTrigger,
};
