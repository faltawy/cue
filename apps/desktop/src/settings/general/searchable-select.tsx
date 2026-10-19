import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";

import { CaretDown, Check } from "@anlg/ui/components/icons";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@anlg/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@anlg/ui/components/ui/popover";
import { selectTriggerClassName } from "@anlg/ui/components/ui/select";
import { cn } from "@anlg/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
  detail?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  dropdownClassName?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}

const filterFunction = (value: string, search: string) => {
  const v = value.toLocaleLowerCase();
  const s = search.toLocaleLowerCase();
  if (v.includes(s)) {
    return 1;
  }
  return 0;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  className,
  dropdownClassName,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: SearchableSelectProps) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setOpen(false);
      setQuery("");
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          data-state={open ? "open" : "closed"}
          className={cn([selectTriggerClassName, className])}
        >
          <span className="truncate">
            {selectedOption
              ? selectedOption.detail
                ? `${selectedOption.label} (${selectedOption.detail})`
                : selectedOption.label
              : (placeholder ?? t`Select...`)}
          </span>
          <CaretDown className="text-muted-foreground size-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(["overflow-hidden p-0", dropdownClassName])}
        style={{
          width: dropdownClassName
            ? undefined
            : "var(--radix-popover-trigger-width)",
        }}
      >
        <Command
          filter={filterFunction}
          className="rounded-[inherit] border-0 bg-transparent"
        >
          <CommandInput
            placeholder={searchPlaceholder ?? t`Search...`}
            value={query}
            onValueChange={setQuery}
          />
          <CommandEmpty>
            <div className="text-muted-foreground text-ui px-2 py-1.5">
              {emptyMessage ?? t`No results found.`}
            </div>
          </CommandEmpty>
          <CommandList>
            <CommandGroup className="max-h-[250px] overflow-y-auto">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={
                    option.detail
                      ? `${option.label} ${option.detail}`
                      : option.label
                  }
                  onSelect={() => handleSelect(option.value)}
                  className={cn([
                    "cursor-pointer",
                    "hover:bg-accent! focus:bg-accent! aria-selected:bg-transparent",
                  ])}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.detail && (
                    <span className="text-muted-foreground text-caption shrink-0 tabular-nums">
                      {option.detail}
                    </span>
                  )}
                  {value === option.value && (
                    <Check className="h-4 w-4 shrink-0" />
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
