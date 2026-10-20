import type { ReactNode } from "react";

import { CaretDown, CaretRight } from "@anlg/ui/components/icons";

export function SidebarSection({
  title,
  expanded,
  onExpandedChange,
  action,
  children,
}: {
  title: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="shrink-0 px-2 pb-1">
      <div className="flex h-7 items-center gap-1">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
          className="text-muted-foreground hover:text-foreground text-label flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md px-2 font-medium transition-colors duration-100"
        >
          {expanded ? (
            <CaretDown aria-hidden className="size-3 shrink-0" />
          ) : (
            <CaretRight
              aria-hidden
              className="size-3 shrink-0 rtl:rotate-180"
            />
          )}
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {expanded ? (
        <div className="scrollbar-hide max-h-48 overflow-y-auto">
          {children}
        </div>
      ) : null}
    </section>
  );
}
