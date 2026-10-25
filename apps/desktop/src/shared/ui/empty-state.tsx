import type { ReactNode } from "react";

import { Chip } from "@anlg/ui/components/ui/chip";
import { cn } from "@anlg/utils";

// Coach empty state (apps/coach/src/ui/components/timeline.tsx): words and a
// chip, no illustration.
export function EmptyState({
  title,
  description,
  action,
  children,
  size = "panel",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: { label: ReactNode; onClick: () => void };
  children?: ReactNode;
  size?: "panel" | "list";
  className?: string;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn([
        "m-auto flex max-w-[340px] flex-col items-center gap-3 text-center",
        size === "panel" ? "py-8" : "px-4 py-6",
        className,
      ])}
    >
      <div>
        <p
          dir="auto"
          className={cn([
            "text-foreground text-balance [overflow-wrap:anywhere]",
            size === "panel" ? "text-title" : "text-ui font-medium",
          ])}
        >
          {title}
        </p>
        {description ? (
          <p
            dir="auto"
            className="text-ui text-muted-foreground mt-1 text-balance [overflow-wrap:anywhere]"
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <Chip onClick={action.onClick}>{action.label}</Chip> : null}
      {children}
    </div>
  );
}
