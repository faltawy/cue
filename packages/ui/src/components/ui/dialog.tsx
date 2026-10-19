import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as React from "react";

import { cn } from "@anlg/utils";

import { X } from "../icons";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

type DialogContentProps = React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  showOverlay?: boolean;
  overlayClassName?: string;
  overlayChildren?: React.ReactNode;
  /** A corner ✕ for dialogs without a Cancel button in the footer. */
  showCloseButton?: boolean;
  /** `top` for the command palette and pickers (cue.md §6). */
  placement?: "center" | "top";
};

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-dialog-overlay
    className={cn([
      "bg-scrim fixed inset-0 z-50",
      "data-[state=closed]:animate-exit data-[state=open]:animate-fade-in",
      className,
    ])}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    {
      className,
      children,
      showOverlay = true,
      overlayClassName,
      overlayChildren,
      showCloseButton = false,
      placement = "center",
      ...props
    },
    ref,
  ) => (
    <DialogPortal>
      {showOverlay ? (
        <DialogOverlay className={overlayClassName}>
          {overlayChildren}
        </DialogOverlay>
      ) : null}
      <div
        className={cn([
          "pointer-events-none fixed inset-0 z-50 flex justify-center px-6",
          placement === "top" ? "items-start pt-14" : "items-center py-6",
        ])}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={cn([
            "pointer-events-auto relative grid max-h-full w-full max-w-[420px] gap-3 overflow-y-auto",
            "border-border bg-background text-foreground rounded-lg border p-4 shadow-2xl",
            "data-[state=closed]:animate-exit data-[state=open]:animate-enter",
            className,
          ])}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close
              className={cn([
                "absolute end-3 top-3 grid size-7 place-items-center rounded-md",
                "text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent transition-[background-color,color] duration-100",
              ])}
            >
              <X className="size-3.5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(["flex flex-col text-start", className])} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(["flex justify-end gap-2 pt-3", className])} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(["text-title text-foreground", className])}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(["text-ui text-muted-foreground mt-1", className])}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
