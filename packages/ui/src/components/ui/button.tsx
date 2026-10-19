import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@anlg/utils";

// docs/design/cue.md §6, after coach `primitives.tsx` Button and IconButton.
const buttonVariants = cva(
  cn([
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap select-none",
    "transition-[background-color,border-color,color,opacity] duration-100 ease-out",
    "disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0",
  ]),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:opacity-90 active:opacity-80 disabled:opacity-40",
        secondary:
          "border-border bg-background text-foreground hover:bg-muted active:bg-accent border disabled:opacity-50",
        outline:
          "border-border bg-background text-foreground hover:bg-muted active:bg-accent border disabled:opacity-50",
        ghost:
          "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent aria-expanded:bg-muted aria-expanded:text-foreground disabled:opacity-40",
        destructive:
          "border-destructive/40 text-destructive hover:bg-destructive/10 active:bg-destructive/15 border disabled:opacity-40",
        "destructive-solid":
          "bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-80 disabled:opacity-40",
        link: "text-foreground underline-offset-4 hover:underline disabled:opacity-40",
      },
      size: {
        default: "text-ui h-8 px-3 [&_svg:not([class*='size-'])]:size-4",
        sm: "text-ui h-7 px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-8 [&_svg:not([class*='size-'])]:size-4",
        round: "size-7 rounded-full [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["default", "sm"], className: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn([buttonVariants({ variant, size, className })])}
        {...props}
        ref={ref}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
