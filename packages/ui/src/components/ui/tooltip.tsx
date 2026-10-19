"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion } from "motion/react";
import * as React from "react";

import { cn } from "@anlg/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, side = "top", ...props }, ref) => {
  const getInitialPosition = () => {
    switch (side) {
      case "top":
        return { y: 3 };
      case "bottom":
        return { y: -3 };
      case "left":
        return { x: 3 };
      case "right":
        return { x: -3 };
      default:
        return { y: 3 };
    }
  };

  const initialPosition = getInitialPosition();

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        side={side}
        asChild
        {...props}
      >
        <motion.div
          initial={{ opacity: 0, ...initialPosition }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...initialPosition }}
          transition={{
            duration: 0.15,
            ease: [0.2, 0, 0, 1],
          }}
          className={cn([
            "z-50 overflow-hidden rounded-md px-2 py-1 text-xs",
            "border-border bg-popover text-popover-foreground border shadow-md",
            "origin-(--radix-tooltip-content-transform-origin)",
            className,
          ])}
        >
          {props.children}
        </motion.div>
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
