import { Trans, useLingui } from "@lingui/react/macro";

import { ChangelogContent } from "@anlg/changelog";
import { commands as openerCommands } from "@anlg/plugin-opener2";
import { Package, X } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

import { availableChangelogVersions, useChangelogContent } from "./data";

import { useShell } from "~/contexts/shell";
import {
  useWindowControlsGutter,
  WINDOW_CONTROLS_GUTTER_PLUS_28_CLASS,
  WINDOW_CONTROLS_GUTTER_PLUS_80_CLASS,
} from "~/shared/hooks/useWindowControlsGutter";
import { StandardContentWrapper } from "~/shared/main";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentChangelog({
  tab,
}: {
  tab: Extract<Tab, { type: "changelog" }>;
}) {
  const { current } = tab.state;
  const { leftsidebar } = useShell();
  const close = useTabs((state) => state.close);
  const showSidebarTimelineHeaderGutter = !leftsidebar.expanded;
  const showExpandedSidebarTimelineHeader = leftsidebar.expanded;

  const versions = availableChangelogVersions();
  if (!versions.includes(current)) versions.unshift(current);

  return (
    <StandardContentWrapper>
      <div className="flex h-full flex-col">
        <div data-tauri-drag-region className="shrink-0 ps-3 pe-1">
          <ChangelogHeader
            showSidebarTimelineHeaderGutter={showSidebarTimelineHeaderGutter}
            showExpandedSidebarTimelineHeader={
              showExpandedSidebarTimelineHeader
            }
            onClose={() => close(tab)}
          />
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className="scroll-fade-y h-full overflow-y-auto px-4 pb-10">
            <div className="mx-auto w-full max-w-3xl py-6">
              {versions.map((version) => (
                <ChangelogRelease
                  key={version}
                  version={version}
                  installed={version === current}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </StandardContentWrapper>
  );
}

function ChangelogRelease({
  version,
  installed,
}: {
  version: string;
  installed: boolean;
}) {
  const content = useChangelogContent(version);

  return (
    <section
      aria-labelledby={`release-${version}`}
      className="group grid grid-cols-[24px_minmax(0,1fr)] gap-x-3 sm:gap-x-5"
    >
      <div aria-hidden="true" className="flex flex-col items-center">
        <div className="text-muted-foreground bg-background flex h-10 shrink-0 items-center">
          <Package size={18} />
        </div>
        <div className="bg-border w-px flex-1 group-last:hidden" />
      </div>
      <article className="border-border bg-card mb-6 min-w-0 rounded-lg border p-5 group-last:mb-0 sm:p-6">
        <div className="border-border mb-5 flex flex-wrap items-center gap-3 border-b pb-4">
          <h2
            id={`release-${version}`}
            className="text-page-title text-foreground tabular-nums"
          >
            v{version}
          </h2>
          {installed && (
            <span className="border-border text-muted-foreground text-label inline-flex h-5 items-center rounded-sm border px-1.5 font-medium">
              <Trans>Installed</Trans>
            </span>
          )}
        </div>
        <ChangelogBody content={content} />
      </article>
    </section>
  );
}

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      className="text-foreground decoration-foreground/30 hover:decoration-foreground underline underline-offset-2 transition-colors"
      href={href}
      onClick={(e) => {
        e.preventDefault();
        void openerCommands.openUrl(href, null);
      }}
    >
      {children}
    </a>
  );
}

function ChangelogBody({ content }: { content: string | null }) {
  if (content) {
    return (
      <ChangelogContent
        content={content}
        className="text-body leading-relaxed wrap-anywhere [&_li]:mb-2 [&_p]:leading-relaxed [&_ul]:ps-5"
        components={{
          a: ({
            href,
            children,
          }: {
            href?: string;
            children?: React.ReactNode;
          }) =>
            href ? (
              <ExternalLink href={href}>{children}</ExternalLink>
            ) : (
              <>{children}</>
            ),
        }}
      />
    );
  }

  return (
    <p className="text-muted-foreground">
      <Trans>No changelog available for this version.</Trans>
    </p>
  );
}

function ChangelogHeader({
  showExpandedSidebarTimelineHeader,
  showSidebarTimelineHeaderGutter,
  onClose,
}: {
  showExpandedSidebarTimelineHeader: boolean;
  showSidebarTimelineHeaderGutter: boolean;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const showWindowControlsGutter = useWindowControlsGutter();
  return (
    <div
      dir="ltr"
      data-tauri-drag-region
      className={cn([
        "relative flex h-12 w-full items-center",
        showSidebarTimelineHeaderGutter &&
          (showWindowControlsGutter
            ? WINDOW_CONTROLS_GUTTER_PLUS_80_CLASS
            : "pl-[80px]"),
      ])}
    >
      <div
        data-tauri-drag-region
        className={cn([
          "pointer-events-none absolute inset-y-0 flex items-center",
          showExpandedSidebarTimelineHeader
            ? "right-[70px] left-0 justify-start"
            : showSidebarTimelineHeaderGutter
              ? cn([
                  "right-[70px] justify-start",
                  showWindowControlsGutter
                    ? WINDOW_CONTROLS_GUTTER_PLUS_28_CLASS
                    : "left-[28px]",
                ])
              : "left-1/2 w-[min(640px,calc(100%_-_160px))] -translate-x-1/2 justify-center",
        ])}
      >
        <h1
          className={cn([
            "text-foreground text-page-title truncate",
            showExpandedSidebarTimelineHeader || showSidebarTimelineHeaderGutter
              ? "text-start"
              : "text-center",
          ])}
        >
          <Trans>What's new</Trans>
        </h1>
      </div>

      <div className="relative z-10 ms-auto flex shrink-0 items-center gap-0 pe-1">
        <Button
          size="icon"
          variant="ghost"
          data-tauri-drag-region="false"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t`Close changelog`}
          title={t`Close`}
          onClick={onClose}
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  );
}
