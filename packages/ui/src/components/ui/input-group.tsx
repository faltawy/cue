import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@anlg/utils";

import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";

function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn([
        "group/input-group border-input bg-background relative flex w-full items-center rounded-md border outline-hidden transition-[border-color] duration-150",
        "h-8 has-[>textarea]:h-auto",
        // Variants based on alignment.
        "[&>input]:has-[>[data-align=inline-start]]:ps-1.5",
        "[&>input]:has-[>[data-align=inline-end]]:pe-1.5",
        "has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col [&>input]:has-[>[data-align=block-start]]:pb-3",
        "has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col [&>input]:has-[>[data-align=block-end]]:pt-3",
        // Focus state.
        "has-[[data-slot=input-group-control]:focus]:border-foreground",
        // Error state.
        "has-[[data-slot][aria-invalid=true]]:border-destructive",
        className,
      ])}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "text-muted-foreground text-ui flex h-auto cursor-text items-center justify-center gap-1.5 py-1.5 font-medium select-none group-data-[disabled=true]/input-group:opacity-50 [&>svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      align: {
        "inline-start":
          "order-first ps-2.5 has-[>button]:ps-1 has-[>kbd]:ps-1.5",
        "inline-end": "order-last pe-2.5 has-[>button]:pe-1 has-[>kbd]:pe-1.5",
        "block-start":
          "order-first w-full justify-start px-3 pt-3 group-has-[>input]/input-group:pt-2.5 [.border-b]:pb-3",
        "block-end":
          "order-last w-full justify-start px-3 pb-3 group-has-[>input]/input-group:pb-2.5 [.border-t]:pt-3",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn([inputGroupAddonVariants({ align }), className])}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return;
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus();
      }}
      {...props}
    />
  );
}

const inputGroupButtonVariants = cva("text-ui flex items-center gap-1.5", {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-sm px-2 has-[>svg]:px-2 [&>svg:not([class*='size-'])]:size-3.5",
      sm: "h-8 gap-1.5 rounded-md px-2.5 has-[>svg]:px-2.5",
      "icon-xs": "size-6 rounded-sm p-0 has-[>svg]:p-0",
      "icon-sm": "size-8 p-0 has-[>svg]:p-0",
    },
  },
  defaultVariants: {
    size: "xs",
  },
});

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      type={type}
      data-size={size}
      variant={variant}
      className={cn([inputGroupButtonVariants({ size }), className])}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn([
        "text-muted-foreground text-ui flex items-center gap-1.5 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5",
        className,
      ])}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(["flex-1 rounded-none border-0 bg-transparent", className])}
      {...props}
    />
  );
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent py-3",
        className,
      )}
      {...props}
    />
  );
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
