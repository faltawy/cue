import { useLingui } from "@lingui/react/macro";

import { Sparkle } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

export function CreateBriefSuggestion({ onCreate }: { onCreate: () => void }) {
  const { t } = useLingui();
  const label = t`Create a brief to prepare this meeting`;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={onCreate}
      className={cn([
        "hover:bg-accent focus-visible:bg-accent pointer-events-auto -ms-2 mb-6 flex h-8 w-fit max-w-full items-center gap-2 rounded-md px-2 text-start",
        "text-muted-foreground hover:text-foreground focus-visible:text-foreground transition-colors focus-visible:outline-hidden",
      ])}
    >
      <Sparkle aria-hidden className="size-4 shrink-0" />
      <span className="text-body min-w-0 truncate font-medium">{label}</span>
    </button>
  );
}
