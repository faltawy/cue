import { Trans, useLingui } from "@lingui/react/macro";
import { Command as CommandPrimitive } from "cmdk";
import {
  createContext,
  type KeyboardEvent,
  useCallback,
  useContext,
  useDeferredValue,
  useMemo,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";

import {
  FileText,
  Gear,
  MagnifyingGlass,
  Microphone,
  NotePencil,
  User,
  type Icon,
} from "@anlg/ui/components/icons";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@anlg/ui/components/ui/dialog";
import { Kbd } from "@anlg/ui/components/ui/kbd";
import { cn } from "@anlg/utils";

import { useHumans } from "~/contacts/queries";
import { useSessionSummaries } from "~/session/queries";
import {
  type CommandGroupId,
  type RankableCommand,
  rankCommands,
} from "~/shared/command-menu/rank";
import { useMainContentCenterOffset } from "~/shared/main/content-offset";
import type { ShortcutKey } from "~/shared/shortcut-keys";
import { ShortcutKeys } from "~/shared/ui/shortcut-hint";
import { useNewNote, useNewNoteAndListen } from "~/shared/useNewNote";
import { useSettingsNavGroups } from "~/sidebar/settings-nav-groups";
import { type TabInput, useTabs } from "~/store/zustand/tabs";

const MAX_RECENT_DISPLAY = 5;
const RECENT_BOOST = 0.1;
const ARIA_KEY_NAMES: Record<string, string> = {
  mod: "Meta",
  shift: "Shift",
  alt: "Alt",
};

interface OpenNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mainContentCenterOffset?: number;
}

type OpenNoteDialogContextValue = {
  open: () => void;
};

type MenuCommand = RankableCommand & {
  icon: Icon;
  meta?: string;
  shortcut?: readonly ShortcutKey[];
  run: (target: "current" | "new") => void;
  opensTab: boolean;
};

const OpenNoteDialogContext = createContext<OpenNoteDialogContextValue | null>(
  null,
);

const OPEN_NOTE_DIALOG_MAX_WIDTH_PX = 576;

export function OpenNoteDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const mainContentCenterOffset = useMainContentCenterOffset(
    open,
    OPEN_NOTE_DIALOG_MAX_WIDTH_PX,
  );

  const openDialog = useCallback(() => {
    setOpen(true);
  }, []);

  useHotkeys("mod+k", openDialog, {
    preventDefault: true,
    enableOnFormTags: true,
    enableOnContentEditable: true,
  });

  const value = useMemo(() => ({ open: openDialog }), [openDialog]);

  return (
    <OpenNoteDialogContext.Provider value={value}>
      {children}
      <OpenNoteDialog
        open={open}
        onOpenChange={setOpen}
        mainContentCenterOffset={mainContentCenterOffset}
      />
    </OpenNoteDialogContext.Provider>
  );
}

export function useOpenNoteDialog() {
  const context = useContext(OpenNoteDialogContext);
  if (!context) {
    throw new Error(
      "useOpenNoteDialog must be used within OpenNoteDialogProvider",
    );
  }
  return context;
}

const noteDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const noteDateWithYearFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatNoteDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.getFullYear() === new Date().getFullYear()
    ? noteDateFormat.format(date)
    : noteDateWithYearFormat.format(date);
}

export function OpenNoteDialog({
  open,
  onOpenChange,
  mainContentCenterOffset = 0,
}: OpenNoteDialogProps) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const openCurrent = useTabs((state) => state.openCurrent);
  const openNew = useTabs((state) => state.openNew);
  const recentlyOpenedSessionIds = useTabs(
    (state) => state.recentlyOpenedSessionIds,
  );
  const settingsNavGroups = useSettingsNavGroups();
  const sessions = useSessionSummaries();
  const humans = useHumans();
  const newNote = useNewNote();
  const newNoteAndListen = useNewNoteAndListen();

  const openDestination = useCallback(
    (destination: TabInput, target: "current" | "new") =>
      target === "current" ? openCurrent(destination) : openNew(destination),
    [openCurrent, openNew],
  );

  const actions = useMemo<MenuCommand[]>(
    () => [
      {
        id: "action-new-note",
        group: "actions",
        label: t`New note`,
        keywords: [t`create`, t`blank`],
        icon: NotePencil,
        shortcut: ["mod", "N"],
        opensTab: false,
        run: () => newNote(),
      },
      {
        id: "action-record",
        group: "actions",
        label: t`Record a meeting`,
        keywords: [t`start recording`, t`listen`, t`transcribe`],
        icon: Microphone,
        shortcut: ["mod", "shift", "N"],
        opensTab: false,
        run: () => newNoteAndListen(),
      },
    ],
    [newNote, newNoteAndListen, t],
  );

  const pages = useMemo<(MenuCommand & { topLevel: boolean })[]>(
    () => [
      ...settingsNavGroups.flatMap((group) =>
        group.items.map((item) => {
          const destination: TabInput =
            "destination" in item
              ? item.destination
              : { type: "settings", state: { tab: item.id } };
          return {
            id: `page-${item.id}`,
            group: "pages" as const,
            label: item.label,
            keywords: [group.label],
            meta: "destination" in item ? undefined : t`Settings`,
            icon: item.icon,
            opensTab: true,
            topLevel: "destination" in item,
            run: () => openNew(destination),
          };
        }),
      ),
      {
        id: "page-settings",
        group: "pages" as const,
        label: t`Settings`,
        keywords: [t`preferences`],
        icon: Gear,
        shortcut: ["mod", ","],
        opensTab: true,
        topLevel: true,
        run: () => openNew({ type: "settings", state: { tab: "app" } }),
      },
    ],
    [settingsNavGroups, openNew, t],
  );

  const recentIds = useMemo(
    () => recentlyOpenedSessionIds.slice(0, MAX_RECENT_DISPLAY),
    [recentlyOpenedSessionIds],
  );

  const notes = useMemo<MenuCommand[]>(() => {
    const recent = new Set(recentIds);
    return [...sessions]
      .sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime(),
      )
      .map((session) => ({
        id: `note-${session.id}`,
        group: "notes" as const,
        label: session.title || t`Untitled`,
        meta: session.created_at
          ? formatNoteDate(session.created_at)
          : undefined,
        boost: recent.has(session.id) ? RECENT_BOOST : 0,
        icon: FileText,
        opensTab: true,
        run: (target: "current" | "new") =>
          openDestination({ type: "sessions", id: session.id }, target),
      }));
  }, [sessions, recentIds, openDestination, t]);

  const people = useMemo<MenuCommand[]>(
    () =>
      humans.flatMap((human) => {
        const label = human.name.trim() || human.email.trim();
        if (!label) return [];
        return [
          {
            id: `person-${human.id}`,
            group: "people" as const,
            label,
            keywords: [human.email, human.jobTitle, ...human.additionalEmails],
            meta: human.name.trim() ? human.email || undefined : undefined,
            icon: User,
            opensTab: true,
            run: () =>
              openNew({
                type: "contacts",
                state: { selected: { type: "person", id: human.id } },
              }),
          },
        ];
      }),
    [humans, openNew],
  );

  const rankedQuery = useDeferredValue(query);
  const isQueryEmpty = !rankedQuery.trim();

  const groups = useMemo<
    { id: CommandGroupId | "recent"; items: MenuCommand[] }[]
  >(() => {
    if (!isQueryEmpty) {
      return rankCommands(
        [...actions, ...notes, ...people, ...pages],
        rankedQuery,
      );
    }
    const byId = new Map(notes.map((note) => [note.id, note]));
    const recent = recentIds.flatMap((id) => byId.get(`note-${id}`) ?? []);
    return [
      {
        id: "recent" as const,
        items: recent.length > 0 ? recent : notes.slice(0, MAX_RECENT_DISPLAY),
      },
      { id: "actions" as const, items: actions },
      { id: "pages" as const, items: pages.filter((page) => page.topLevel) },
    ].filter((group) => group.items.length > 0);
  }, [isQueryEmpty, actions, notes, people, pages, rankedQuery, recentIds]);

  const commandsById = useMemo(
    () =>
      new Map(
        groups.flatMap((group) => group.items.map((item) => [item.id, item])),
      ),
    [groups],
  );
  const selectedCommand = commandsById.get(selected);

  const headings: Record<CommandGroupId | "recent", string> = {
    recent: t`Recent`,
    actions: t`Actions`,
    notes: t`Notes`,
    people: t`People`,
    pages: t`Go to`,
  };

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("");
        setSelected("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange],
  );

  const runCommand = useCallback(
    (command: MenuCommand, target: "current" | "new") => {
      handleOpenChange(false);
      command.run(target);
    },
    [handleOpenChange],
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (!selectedCommand) return;
    event.preventDefault();
    runCommand(selectedCommand, "new");
  };

  const focusInput = useCallback((node: HTMLInputElement | null) => {
    node?.focus();
  }, []);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        placement="top"
        overlayChildren={
          <div
            data-open-note-dialog-drag-region
            data-tauri-drag-region
            className="absolute inset-x-0 top-0 h-14"
            onClick={(event) => event.stopPropagation()}
          />
        }
        className="gap-0 overflow-hidden p-0"
        style={{
          left: mainContentCenterOffset,
          maxWidth: OPEN_NOTE_DIALOG_MAX_WIDTH_PX,
        }}
        onPointerDownOutside={(event) => {
          const target = event.detail.originalEvent.target;
          if (
            target instanceof Element &&
            target.closest("[data-open-note-dialog-drag-region]")
          ) {
            event.preventDefault();
          }
        }}
      >
        <DialogTitle className="sr-only">
          <Trans>Search or jump to…</Trans>
        </DialogTitle>
        <CommandPrimitive
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          onKeyDown={handleKeyDown}
          loop
          className="flex flex-col"
        >
          <div className="border-border flex h-11 items-center gap-2 border-b px-3">
            <MagnifyingGlass className="text-muted-foreground size-4 shrink-0" />
            <CommandPrimitive.Input
              ref={focusInput}
              value={query}
              onValueChange={setQuery}
              placeholder={t`Search or jump to…`}
              className={cn([
                "text-body h-full min-w-0 flex-1 bg-transparent",
                "placeholder:text-tertiary-foreground focus-visible:outline-none",
              ])}
            />
            <Kbd>Esc</Kbd>
          </div>

          <CommandPrimitive.List className="max-h-[min(420px,60vh)] scroll-py-1 overflow-y-auto p-1">
            {groups.length === 0 ? (
              <CommandPrimitive.Empty className="flex flex-col items-center gap-1 py-10 text-center">
                <span className="text-foreground text-ui">
                  <Trans>No results for “{rankedQuery.trim()}”</Trans>
                </span>
                <span className="text-muted-foreground text-label">
                  <Trans>Try a note title, a person, or a setting.</Trans>
                </span>
              </CommandPrimitive.Empty>
            ) : (
              groups.map((group) => (
                <CommandPrimitive.Group
                  key={group.id}
                  heading={headings[group.id]}
                  className={cn([
                    "[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:text-label [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:font-medium",
                  ])}
                >
                  {group.items.map((command) => (
                    <CommandRow
                      key={`${group.id}-${command.id}`}
                      command={command}
                      onSelect={() => runCommand(command, "current")}
                    />
                  ))}
                </CommandPrimitive.Group>
              ))
            )}
          </CommandPrimitive.List>

          <div className="border-border text-muted-foreground text-caption flex h-9 items-center gap-4 border-t px-3">
            <span className="flex items-center gap-1.5">
              <ShortcutKeys keys={["↑", "↓"]} />
              <Trans>Navigate</Trans>
            </span>
            <span className="flex items-center gap-1.5">
              <ShortcutKeys keys={["enter"]} />
              {selectedCommand && !selectedCommand.opensTab ? (
                <Trans>Run</Trans>
              ) : (
                <Trans>Open</Trans>
              )}
            </span>
            {selectedCommand?.opensTab ? (
              <span className="flex items-center gap-1.5">
                <ShortcutKeys keys={["mod", "enter"]} />
                <Trans>Open in new tab</Trans>
              </span>
            ) : null}
          </div>
        </CommandPrimitive>
      </DialogContent>
    </Dialog>
  );
}

function CommandRow({
  command,
  onSelect,
}: {
  command: MenuCommand;
  onSelect: () => void;
}) {
  const CommandIcon = command.icon;
  return (
    <CommandPrimitive.Item
      value={command.id}
      onSelect={onSelect}
      aria-keyshortcuts={
        command.shortcut
          ? command.shortcut.map((key) => ARIA_KEY_NAMES[key] ?? key).join("+")
          : undefined
      }
      className={cn([
        "group flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5",
        "text-foreground text-ui",
        "data-[selected=true]:bg-muted",
      ])}
    >
      <CommandIcon className="text-muted-foreground group-data-[selected=true]:text-foreground size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-start [unicode-bidi:plaintext]">
        {command.label}
      </span>
      {command.shortcut ? (
        <span aria-hidden className="shrink-0">
          <ShortcutKeys keys={command.shortcut} />
        </span>
      ) : command.meta ? (
        <span
          aria-hidden
          className="text-muted-foreground text-label max-w-[40%] shrink-0 truncate"
        >
          {command.meta}
        </span>
      ) : null}
    </CommandPrimitive.Item>
  );
}
