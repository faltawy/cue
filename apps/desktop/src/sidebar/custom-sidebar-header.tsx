import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";

import { ArrowLeft } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import {
  useWindowControlsGutter,
  WINDOW_CONTROLS_GUTTER_CLASS,
  WINDOW_CONTROLS_ROW_PADDING_TOP_CLASS,
} from "~/shared/hooks/useWindowControlsGutter";
import { leaveOverlayTab } from "~/shared/leave-overlay-tab";

export function CustomSidebarHeader({ children }: { children?: ReactNode }) {
  const { t } = useLingui();
  const showWindowControlsGutter = useWindowControlsGutter();

  return (
    <div
      data-tauri-drag-region
      className={cn([
        "flex h-12 shrink-0 items-start py-0 pe-1",
        showWindowControlsGutter
          ? [
              WINDOW_CONTROLS_GUTTER_CLASS,
              WINDOW_CONTROLS_ROW_PADDING_TOP_CLASS,
            ]
          : "ps-2 pt-[9px]",
      ])}
    >
      <div
        data-tauri-drag-region
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        <CustomSidebarHeaderButton
          label={t`Go home`}
          title={t`Back`}
          onClick={leaveOverlayTab}
        >
          <ArrowLeft size={16} />
        </CustomSidebarHeaderButton>
      </div>
      {children ? (
        <div
          data-tauri-drag-region="false"
          className="ms-1 flex shrink-0 items-center"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CustomSidebarHeaderButton({
  children,
  disabled = false,
  label,
  onClick,
  title,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      data-tauri-drag-region="false"
      disabled={disabled}
      className={cn([
        "relative z-50 flex size-7 shrink-0 items-center justify-center rounded-md",
        "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
        "disabled:text-muted-foreground/70 disabled:hover:text-muted-foreground/70 disabled:hover:bg-transparent",
      ])}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
