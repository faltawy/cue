import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";

import { commands as openerCommands } from "@anlg/plugin-opener2";
import { Button } from "@anlg/ui/components/ui/button";
import { Kbd, KbdGroup } from "@anlg/ui/components/ui/kbd";
import { cn, startOfDay } from "@anlg/utils";

import { toTz, useNow } from "~/calendar/hooks";
import { useIgnoredEvents } from "~/calendar/ignored-events";
import { useTimelineEventsTable } from "~/calendar/queries";
import { showCoach } from "~/coach/commands";
import { useHomeOpenFollowUps, useHomeRecentNotes } from "~/main/home-data";
import { buildTrayScheduleEvents } from "~/services/tray-schedule";
import { getOrCreateSessionForEventId } from "~/session/queries";
import { useConfigValue } from "~/shared/config";
import { StandardContentWrapper } from "~/shared/main";
import { acceleratorKeys, shortcutLabels } from "~/shared/shortcut-keys";
import {
  openSessionAndListen,
  useNewNote,
  useNewNoteAndListen,
} from "~/shared/useNewNote";
import { type Tab, useTabs } from "~/store/zustand/tabs";

export function TabContentEmpty({
  tab: _tab,
}: {
  tab: Extract<Tab, { type: "empty" }>;
}) {
  return (
    <StandardContentWrapper>
      <EmptyView />
    </StandardContentWrapper>
  );
}

function useNextMeeting() {
  const events = useTimelineEventsTable();
  const { isIgnored } = useIgnoredEvents();
  const timezone = useConfigValue("timezone") || undefined;
  const use24HourTime = useConfigValue("use_24_hour_time");
  const now = useNow();
  return useMemo(() => {
    const [next] = buildTrayScheduleEvents(
      events,
      isIgnored,
      now.getTime(),
      timezone,
      undefined,
      use24HourTime,
    );
    if (!next) return null;
    const today = startOfDay(toTz(now, timezone)).getTime();
    return {
      ...next,
      day:
        next.startsAtMs <= now.getTime() || next.dayStartMs === today
          ? ("today" as const)
          : next.previousDayStartMs === today
            ? ("tomorrow" as const)
            : new Intl.DateTimeFormat(undefined, {
                weekday: "short",
                timeZone: timezone,
              }).format(next.startsAtMs),
    };
  }, [events, isIgnored, now, timezone, use24HourTime]);
}

function EmptyView() {
  const { t } = useLingui();
  const newNote = useNewNote({ behavior: "current" });
  const newNoteAndListen = useNewNoteAndListen({ behavior: "current" });
  const coachShortcut = useConfigValue("coach_shortcut");
  const next = useNextMeeting();
  const recentNotes = useHomeRecentNotes();
  const followUps = useHomeOpenFollowUps();
  const openCurrent = useTabs((state) => state.openCurrent);

  const recordNext = useCallback(async () => {
    if (!next) return;
    if (next.meetingLink) {
      await openerCommands.openUrl(next.meetingLink, null).catch((error) => {
        console.error("[home] failed to open the meeting link", error);
      });
    }
    try {
      const sessionId = await getOrCreateSessionForEventId(next.id);
      openSessionAndListen(sessionId, { behavior: "current" });
    } catch (error) {
      console.error("[home] failed to record the next meeting", error);
    }
  }, [next]);

  return (
    <div
      data-tauri-drag-region
      className="flex h-full flex-col items-center justify-center"
    >
      <div className="flex w-full max-w-2xl flex-col gap-7 px-6 py-8">
        <h1 className="text-title text-center text-balance">
          <Trans>A clearer place to start</Trans>
        </h1>

        {next ? (
          <div
            data-tauri-drag-region="false"
            className="border-border flex w-full flex-col gap-2.5 rounded-lg border px-3 pt-2.5 pb-3 text-start"
          >
            <div className="flex min-w-0 flex-col">
              <bdi
                dir="auto"
                title={next.title}
                className="text-strong max-w-full self-start truncate [unicode-bidi:plaintext]"
              >
                {next.title}
              </bdi>
              <span className="text-label text-muted-foreground tabular-nums">
                <bdi>
                  {next.day === "today"
                    ? t`Today`
                    : next.day === "tomorrow"
                      ? t`Tomorrow`
                      : next.day}
                </bdi>
                {" · "}
                <bdi>{next.timeLabel}</bdi>
              </span>
            </div>
            <Button type="button" className="w-full" onClick={recordNext}>
              {next.meetingLink ? (
                <Trans>Join & record</Trans>
              ) : (
                <Trans>Record this event</Trans>
              )}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            data-tauri-drag-region="false"
            className="w-full"
            onClick={newNoteAndListen}
          >
            <Trans>Start recording</Trans>
            <ShortcutKbds
              keys={["⌘", "⇧", "N"]}
              className="[&_kbd]:border-primary-foreground/30 [&_kbd]:text-primary-foreground/70 [&_kbd]:bg-transparent"
            />
          </Button>
        )}

        <div className="flex flex-col gap-5">
          {recentNotes.length > 0 && (
            <section
              className="flex flex-col gap-1"
              aria-labelledby="home-recent-notes"
            >
              <h2
                id="home-recent-notes"
                className="text-label text-muted-foreground px-2 font-medium"
              >
                <Trans>Recent notes</Trans>
              </h2>
              {recentNotes.map((note) => (
                <ActionItem
                  key={note.id}
                  label={note.title}
                  shortcut={[]}
                  onClick={() => openCurrent({ type: "sessions", id: note.id })}
                />
              ))}
            </section>
          )}
          {followUps.length > 0 && (
            <section
              className="flex flex-col gap-1"
              aria-labelledby="home-open-follow-ups"
            >
              <h2
                id="home-open-follow-ups"
                className="text-label text-muted-foreground px-2 font-medium"
              >
                <Trans>Open follow-ups</Trans>
              </h2>
              {followUps.map((item) => (
                <ActionItem
                  key={item.id}
                  label={
                    <span className="flex min-w-0 flex-col text-start">
                      <span className="truncate">{item.text}</span>
                      <span className="text-muted-foreground text-label">
                        {item.session_title}
                      </span>
                    </span>
                  }
                  shortcut={[]}
                  onClick={() =>
                    openCurrent({ type: "sessions", id: item.session_id })
                  }
                />
              ))}
            </section>
          )}
        </div>

        <div className="flex w-full flex-col gap-0.5">
          <ActionItem
            label={<Trans>New note</Trans>}
            shortcut={["⌘", "N"]}
            onClick={newNote}
          />
          <ActionItem
            label={<Trans>Open coach</Trans>}
            shortcut={shortcutLabels(acceleratorKeys(coachShortcut))}
            onClick={() => void showCoach()}
          />
        </div>
      </div>
    </div>
  );
}

function ShortcutKbds({
  keys,
  className,
}: {
  keys: string[];
  className?: string;
}) {
  return (
    <KbdGroup aria-hidden className={className}>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </KbdGroup>
  );
}

function ActionItem({
  label,
  shortcut,
  onClick,
}: {
  label: React.ReactNode;
  shortcut: string[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tauri-drag-region="false"
      className={cn([
        "flex h-7 items-center justify-between gap-8 rounded-md px-2",
        "text-ui text-muted-foreground",
        "hover:bg-muted hover:text-foreground focus-visible:bg-muted cursor-pointer transition-colors duration-100 motion-reduce:transition-none",
      ])}
    >
      <span>{label}</span>
      {shortcut.length > 0 && <ShortcutKbds keys={shortcut} />}
    </button>
  );
}
