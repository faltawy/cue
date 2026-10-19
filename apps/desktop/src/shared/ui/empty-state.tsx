import type { ReactNode } from "react";

import { Chip } from "@anlg/ui/components/ui/chip";
import { cn } from "@anlg/utils";

// Coach empty state (apps/coach/src/ui/components/timeline.tsx): words and a
// chip, no illustration.
export function EmptyState({
  title,
  description,
  action,
  size = "panel",
  className,
}: {
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
        "m-auto flex max-w-[340px] flex-col items-center gap-3 text-center",
        size === "panel" ? "py-8" : "px-4 py-6",
        className,
      ])}
    >
      <div>
        <p
          className={cn([
            "text-foreground text-balance",
            size === "panel" ? "text-title" : "text-ui font-medium",
          ])}
        >
          {title}
        </p>
        {description ? (
          <p className="text-ui text-muted-foreground mt-1 text-balance">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <Chip onClick={action.onClick}>{action.label}</Chip> : null}
    </div>
  );
}
