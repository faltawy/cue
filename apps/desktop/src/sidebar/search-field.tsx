import { useLingui } from "@lingui/react/macro";

import { MagnifyingGlass, X } from "@anlg/ui/components/icons";
import {
  searchFieldClassName,
  searchFieldInputClassName,
} from "@anlg/ui/components/ui/input";
import { cn } from "@anlg/utils";

export function SidebarSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const { t } = useLingui();

  return (
    <div className="pb-2">
      <div className={cn([searchFieldClassName, "w-full shrink-0"])}>
        <MagnifyingGlass className="text-muted-foreground size-3.5 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onChange("");
          }}
          placeholder={placeholder}
          className={searchFieldInputClassName}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-muted-foreground hover:text-foreground size-3.5 shrink-0 transition-colors duration-100"
            aria-label={t`Clear search`}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
