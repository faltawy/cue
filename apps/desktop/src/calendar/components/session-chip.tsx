import { useLingui } from "@lingui/react/macro";
import { format } from "date-fns";
import { useCallback, useMemo } from "react";

import { commands as fsSyncCommands } from "@anlg/plugin-fs-sync";
import { commands as openerCommands } from "@anlg/plugin-opener2";
import { Button } from "@anlg/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@anlg/ui/components/ui/popover";
import { cn } from "@anlg/utils";

import { toTz, useTimezone } from "~/calendar/hooks";
import { useDeleteSession } from "~/session/hooks/useDeleteSession";
import { getSessionEvent } from "~/session/utils";
import {
  type MenuItemDef,
  useNativeContextMenu,
} from "~/shared/hooks/useNativeContextMenu";
import { useTimeFormat } from "~/shared/hooks/useTimeFormat";
import type { TimelineSessionRow } from "~/sidebar/timeline/utils";
import { useTabs } from "~/store/zustand/tabs";

export function SessionChip({
  sessionId,
  session,
}: {
  sessionId: string;
  session: TimelineSessionRow | undefined;
}) {
  const { t } = useLingui();
  const tz = useTimezone();
  const timeFormat = useTimeFormat();
  const deleteSession = useDeleteSession();
  const title = session?.title ?? undefined;
  const eventJson = session?.event_json;
  const createdAt = session?.created_at
    ? format(toTz(session.created_at, tz), timeFormat)
    : null;

  const handleShowInFolder = useCallback(async () => {
    const result = await fsSyncCommands.sessionDir(sessionId);
    if (result.status === "ok") {
      await openerCommands.openPath(result.data, null);
    }
  }, [sessionId]);

  const handleDelete = useCallback(() => {
    const sessionEvent = getSessionEvent({ event_json: eventJson });
    deleteSession(sessionId, {
      trackingId: sessionEvent?.tracking_id,
      title,
    });
  }, [deleteSession, sessionId, eventJson, title]);

  const contextMenu = useMemo<MenuItemDef[]>(
    () => [
      {
        id: "show",
        text: t`Show in Finder`,
        action: handleShowInFolder,
      },
      { separator: true },
      {
        id: "delete",
        text: "Delete Note",
        action: handleDelete,
      },
    ],
    [t, handleShowInFolder, handleDelete],
  );
  const showContextMenu = useNativeContextMenu(contextMenu);

  if (!session || !title) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn([
            "text-label flex w-full items-center gap-1 rounded-sm ps-0.5 text-start leading-tight",
            "cursor-pointer select-none hover:opacity-80",
          ])}
          onContextMenu={showContextMenu}
        >
          <div className="border-border w-[4px] shrink-0 self-stretch rounded-full border bg-transparent" />
          <span className="min-w-0 truncate [unicode-bidi:plaintext]">
            {title}
          </span>
          {createdAt && (
            <span className="text-muted-foreground ms-auto shrink-0 tabular-nums">
              {createdAt}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <SessionPopoverContent sessionId={sessionId} session={session} />
      </PopoverContent>
    </Popover>
  );
}

function SessionPopoverContent({
  sessionId,
  session,
}: {
  sessionId: string;
  session: TimelineSessionRow;
}) {
  const openCurrent = useTabs((state) => state.openCurrent);
  const tz = useTimezone();
  const timeFormat = useTimeFormat();

  const handleOpen = useCallback(() => {
    openCurrent({ type: "sessions", id: sessionId });
  }, [openCurrent, sessionId]);

  const createdAt = session.created_at
    ? format(toTz(session.created_at, tz), `MMM d, yyyy ${timeFormat}`)
    : null;

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="text-foreground text-title">{session.title}</div>
      <div className="bg-border h-px" />
      {createdAt && (
        <div className="text-muted-foreground text-body">{createdAt}</div>
      )}
      <Button
        size="sm"
        className="bg-primary text-primary-foreground hover:bg-primary/90 min-h-8 w-full"
        onClick={handleOpen}
      >
        Open note
      </Button>
    </div>
  );
}
