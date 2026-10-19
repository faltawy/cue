import type { ReactNode } from "react";

import type { Icon } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

export function EmptyState({
  icon: EmptyIcon,
  title,
  description,
  action,
  size = "panel",
  className,
}: {
  icon?: Icon;
  title: ReactNode;
  description?: ReactNode;
  action?: { label: ReactNode; onClick: () => void };
  size?: "panel" | "list";
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn([
        "flex flex-col items-center text-center",
        size === "panel"
          ? "h-full justify-center gap-3 px-6"
          : "gap-2 px-4 py-8",
        className,
      ])}
    >
      {EmptyIcon ? (
        <EmptyIcon
          aria-hidden
          className={cn([
            "text-muted-foreground/60",
            size === "panel" ? "size-8" : "size-6",
          ])}
        />
      ) : null}
      <div className="flex max-w-72 flex-col gap-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={action.onClick}
          className="mt-1"
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
