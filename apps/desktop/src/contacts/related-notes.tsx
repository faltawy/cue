import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

import { ArrowsDownUp, MagnifyingGlass, X } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import {
  searchFieldClassName,
  searchFieldInputClassName,
} from "@anlg/ui/components/ui/input";
import { cn } from "@anlg/utils";

import type { HumanSessionRecord } from "./queries";

import { NoteSortOrder } from "~/sidebar/enums";

export function RelatedNotesSection({
  sessions,
  onSessionClick,
}: {
  sessions: HumanSessionRecord[];
  onSessionClick: (id: string) => void;
}) {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<NoteSortOrder>(
    NoteSortOrder.Newest,
  );
  const visibleSessions = sortAndFilterRelatedNotes(
    sessions,
    search,
    sortOrder,
  );

  return (
    <div className="p-6">
      <div className="mb-3 flex items-center gap-1">
        <h3 className="text-muted-foreground text-body font-medium">
          <Trans>Related Notes</Trans>
        </h3>
        {sessions.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground size-7"
                aria-label={t`Sort options`}
              >
                <ArrowsDownUp size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as NoteSortOrder)}
              >
                <DropdownMenuRadioItem value="newest">
                  <Trans>Newest</Trans>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="oldest">
                  <Trans>Oldest</Trans>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className={cn([searchFieldClassName, "ms-auto w-52 max-w-[48%]"])}>
          <MagnifyingGlass className="text-muted-foreground size-3.5 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearch("");
            }}
            placeholder={t`Search...`}
            className={searchFieldInputClassName}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              aria-label={t`Clear search`}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {visibleSessions.length > 0 ? (
        <ul>
          {visibleSessions.map((session) => (
            <li key={session.id}>
              <button
                type="button"
                onClick={() => onSessionClick(session.id)}
                className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2 text-start transition-colors"
              >
                <span className="bg-muted-foreground size-1.5 shrink-0 rounded-full" />
                <span className="text-body min-w-0 flex-1 truncate">
                  {session.title || t`Untitled Note`}
                </span>
                {session.createdAt && (
                  <time className="text-muted-foreground text-label shrink-0">
                    {new Date(session.createdAt).toLocaleDateString()}
                  </time>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-body px-2 py-2">
          {sessions.length > 0 ? (
            <Trans>No results found.</Trans>
          ) : (
            <Trans>No related notes found</Trans>
          )}
        </p>
      )}
    </div>
  );
}

function sortAndFilterRelatedNotes(
  sessions: HumanSessionRecord[],
  search: string,
  sortOrder: NoteSortOrder,
): HumanSessionRecord[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const direction = sortOrder === NoteSortOrder.Newest ? -1 : 1;

  return sessions
    .filter(
      (session) =>
        !normalizedSearch ||
        session.title.toLocaleLowerCase().includes(normalizedSearch),
    )
    .sort((left, right) => {
      const dateDifference =
        getSessionTimestamp(left.createdAt) -
        getSessionTimestamp(right.createdAt);
      return dateDifference !== 0
        ? dateDifference * direction
        : left.id.localeCompare(right.id) * direction;
    });
}

function getSessionTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
