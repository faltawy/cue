import { type DialogProps } from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";

import { Dialog, DialogContent } from "@anlg/ui/components/ui/dialog";
import { cn } from "@anlg/utils";

import { MagnifyingGlass } from "../icons";
import { DialogPlacement } from "./dialog";
import { menuItemClassName, menuSeparatorClassName } from "./floating-content";
import { Kbd } from "./kbd";

const Command = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    ref={ref}
    className={cn([
      "text-popover-foreground flex h-full w-full flex-col overflow-hidden",
      className,
    ])}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandDialog = ({ children, ...props }: DialogProps) => {
  return (
    <Dialog {...props}>
      <DialogContent
        placement={DialogPlacement.Top}
        className="max-w-[560px] gap-0 p-0"
      >
        <Command className="[&_[cmdk-input-wrapper]]:h-11 [&_[cmdk-input-wrapper]_svg]:size-4">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const CommandInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <div
    className="border-border flex h-9 items-center gap-2 border-b px-3"
    cmdk-input-wrapper=""
  >
    <MagnifyingGlass className="text-muted-foreground size-3.5 shrink-0" />
    <CommandPrimitive.Input
      ref={ref}
      className={cn([
        "placeholder:text-tertiary-foreground text-body flex h-full w-full min-w-0 bg-transparent outline-hidden disabled:opacity-50",
        "focus-visible:outline-none",
        className,
      ])}
      {...props}
    />
  </div>
));

CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn([
      "max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto",
      className,
    ])}
    {...props}
  />
));

CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="text-ui text-muted-foreground px-2 py-6 text-center"
    {...props}
  />
));

CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn([
      "text-foreground **:[[cmdk-group-heading]]:text-label **:[[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:pt-1.5 **:[[cmdk-group-heading]]:pb-1 **:[[cmdk-group-heading]]:font-medium",
      className,
    ])}
    {...props}
  />
));

CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandSeparator = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn([menuSeparatorClassName, "mx-0", className])}
    {...props}
  />
));
CommandSeparator.displayName = CommandPrimitive.Separator.displayName;

const CommandItem = React.forwardRef<
  React.ComponentRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn([
      menuItemClassName,
      "data-[selected=true]:bg-muted data-[selected=true]:[&_svg:not([class*='text-'])]:text-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-40",
      className,
    ])}
    {...props}
  />
));

CommandItem.displayName = CommandPrimitive.Item.displayName;

const CommandShortcut = ({
  className,
  ...props
}: React.ComponentProps<typeof Kbd>) => (
  <Kbd className={cn(["ms-auto", className])} {...props} />
);
CommandShortcut.displayName = "CommandShortcut";

export {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
};
