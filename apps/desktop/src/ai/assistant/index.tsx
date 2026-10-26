import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { create } from "zustand";

import type { HeaderSlot } from "@anlg/assistant";
import { commands } from "@anlg/plugin-coach";
import { PictureInPicture, Sparkle, X } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

import { createAssistantHost } from "./host";

import { useTabs } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

const Assistant = lazy(() =>
  import("@anlg/assistant").then((module) => ({ default: module.Assistant })),
);
const useAssistantPanel = create<{
  open: boolean;
  width: number;
  toggle(): void;
  resize(width: number): void;
}>((set) => ({
  open: false,
  width: 420,
  toggle: () => set((state) => ({ open: !state.open })),
  resize: (width) => set({ width: Math.max(340, Math.min(640, width)) }),
}));

export function AssistantLayout({ children }: { children: ReactNode }) {
  const { t } = useLingui();
  const currentTab = useTabs((state) => state.currentTab);
  const popOut = useMutation({
    mutationFn: async () => {
      const result = await commands.showAssistant();
      if (result.status === "error") throw new Error(result.error);
    },
  });
  const { open, width, toggle, resize } = useAssistantPanel();
  const closeButton = (
    <Button
      size="icon"
      variant="ghost"
      aria-expanded={true}
      aria-label={t`Close assistant`}
      title={t`Close assistant`}
      onClick={toggle}
    >
      <X className="size-4" />
    </Button>
  );
  return (
    <div className="@container relative flex min-h-0 min-w-0 flex-1">
      <div
        className={cn([
          "flex min-h-0 min-w-0 flex-1",
          open && "hidden @min-[1000px]:flex",
        ])}
      >
        {children}
      </div>
      {!open && (
        <Button
          size="icon"
          variant="outline"
          aria-expanded={false}
          aria-label={t`Open assistant`}
          title={t`Open assistant`}
          onClick={toggle}
          className="absolute end-4 bottom-4 z-10 size-9 rounded-full shadow-md"
        >
          <Sparkle className="size-4" />
        </Button>
      )}
      {open && (
        <aside
          aria-label={t`AI assistant`}
          className="border-border bg-background flex min-h-0 w-full shrink-0 border-s @min-[1000px]:w-[min(var(--assistant-width),calc(100%_-_600px))]"
          style={{ "--assistant-width": `${width}px` } as React.CSSProperties}
        >
          <div
            role="separator"
            aria-label={t`Resize assistant`}
            aria-orientation="vertical"
            aria-valuenow={width}
            aria-valuemin={340}
            aria-valuemax={640}
            tabIndex={0}
            className="hover:bg-border hidden w-1 shrink-0 cursor-col-resize @min-[1000px]:block"
            onPointerDown={(event) =>
              event.currentTarget.setPointerCapture(event.pointerId)
            }
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                resize(width - event.movementX);
            }}
            onPointerUp={(event) =>
              event.currentTarget.releasePointerCapture(event.pointerId)
            }
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                resize(width + (event.key === "ArrowLeft" ? 20 : -20));
              }
            }}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {popOut.isError && (
              <p role="alert" className="text-destructive text-ui px-3">
                {popOut.error.message}
              </p>
            )}
            <Suspense
              fallback={
                <div className="border-border flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
                  <span className="text-muted-foreground text-ui">
                    <Trans>Opening assistant…</Trans>
                  </span>
                  {closeButton}
                </div>
              }
            >
              <EmbeddedAssistant
                header={{
                  subtitle:
                    currentTab?.type === TabType.Sessions
                      ? t`Using the open note`
                      : t`Across your meetings`,
                  actions: (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t`Pop out`}
                        title={t`Pop out`}
                        disabled={popOut.isPending}
                        onClick={() =>
                          popOut.mutate(undefined, { onSuccess: toggle })
                        }
                      >
                        <PictureInPicture className="size-4" />
                      </Button>
                      {closeButton}
                    </>
                  ),
                }}
              />
            </Suspense>
          </div>
        </aside>
      )}
    </div>
  );
}

function EmbeddedAssistant({ header }: { header: HeaderSlot }) {
  const [host] = useState(createAssistantHost);
  return <Assistant host={host} header={header} />;
}
