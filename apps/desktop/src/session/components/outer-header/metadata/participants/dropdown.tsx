import { type CSSProperties, useEffect, useRef } from "react";

import { ArrowElbowDownLeft } from "@anlg/ui/components/icons";
import { floatingSurfaceClassName } from "@anlg/ui/components/ui/floating-content";
import { cn } from "@anlg/utils";

type DropdownOption = {
  id: string;
  name: string;
  isNew?: boolean;
  email?: string;
  orgId?: string;
  jobTitle?: string;
};

export function ParticipantDropdown({
  floatingRef,
  floatingStyles,
  options,
  selectedIndex,
  onSelect,
  onHover,
}: {
  floatingRef: (node: HTMLDivElement | null) => void;
  floatingStyles: CSSProperties;
  options: DropdownOption[];
  selectedIndex: number;
  onSelect: (option: DropdownOption) => void;
  onHover: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const selectedElement = list.children[selectedIndex] as HTMLElement;
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, options]);

  if (options.length === 0) {
    return null;
  }

  return (
    <div
      ref={floatingRef}
      style={floatingStyles}
      className={cn([floatingSurfaceClassName, "overflow-hidden p-1"])}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div ref={listRef} className="max-h-50 overflow-auto">
        {options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            tabIndex={-1}
            className={cn([
              "text-ui flex h-7 w-full items-center rounded-md px-2 text-start",
              selectedIndex === index ? "bg-muted" : "hover:bg-muted",
            ])}
            onClick={() => onSelect(option)}
            onMouseEnter={() => onHover(index)}
          >
            <span className="flex w-full min-w-0 items-center justify-between gap-2">
              {option.isNew ? (
                <span className="min-w-0 truncate">
                  Add "<span className="font-medium">{option.name}</span>"
                </span>
              ) : (
                <span
                  title={option.name}
                  className="flex min-w-0 items-center gap-2"
                >
                  <span className="min-w-0 truncate font-medium [unicode-bidi:plaintext]">
                    {option.name}
                  </span>
                  {option.jobTitle && (
                    <span className="text-muted-foreground text-label min-w-0 truncate">
                      {option.jobTitle}
                    </span>
                  )}
                </span>
              )}
              {selectedIndex === index && (
                <ArrowElbowDownLeft className="text-muted-foreground size-3 shrink-0" />
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
