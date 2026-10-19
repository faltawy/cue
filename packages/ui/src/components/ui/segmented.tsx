import * as React from "react";

import { cn } from "@anlg/utils";

// cue.md §6 (ext): a 6px track with 4px items 2px inside it.
export const segmentedTrackClassName =
  "bg-muted inline-flex h-7 max-w-full shrink-0 items-center gap-0.5 rounded-md p-0.5";

export function segmentedItemClassName(selected: boolean) {
  return cn([
    "text-ui inline-flex h-6 min-w-0 shrink-0 items-center justify-center gap-1.5 rounded-sm px-2.5 font-medium whitespace-nowrap select-none",
    "transition-[background-color,color] duration-100 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
    "disabled:pointer-events-none disabled:opacity-40",
    selected
      ? "bg-background text-foreground ring-border ring-1"
      : "text-muted-foreground hover:text-foreground",
  ]);
}

type SegmentedContextValue = {
  value: string;
  select: (value: string) => void;
};

const SegmentedContext = React.createContext<SegmentedContextValue | null>(
  null,
);

/** A single choice among a few options, shown side by side. */
function SegmentedControl({
  value,
  onValueChange,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const context = React.useMemo(
    () => ({ value, select: onValueChange }),
    [value, onValueChange],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const radios = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[role=radio]:not(:disabled)",
      ),
    );
    const index = radios.findIndex((radio) => radio === document.activeElement);
    if (index === -1) return;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const forward = (event.key === "ArrowRight") !== rtl;
    const next =
      radios[(index + (forward ? 1 : -1) + radios.length) % radios.length];
    event.preventDefault();
    next.focus();
    next.click();
  };

  return (
    <SegmentedContext.Provider value={context}>
      <div
        role="radiogroup"
        className={cn([segmentedTrackClassName, className])}
        onKeyDown={onKeyDown}
        {...props}
      >
        {children}
      </div>
    </SegmentedContext.Provider>
  );
}

function SegmentedItem({
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "value"> & { value: string }) {
  const context = React.useContext(SegmentedContext);
  if (!context)
    throw new Error("SegmentedItem must be inside SegmentedControl");
  const selected = context.value === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-state={selected ? "on" : "off"}
      className={cn([segmentedItemClassName(selected), className])}
      onClick={() => context.select(value)}
      {...props}
    />
  );
}

export { SegmentedControl, SegmentedItem };
