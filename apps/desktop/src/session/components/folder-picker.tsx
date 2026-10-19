import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo, useState } from "react";

import { CaretRight, Check, Folder, Plus } from "@anlg/ui/components/icons";
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
import { cn } from "@anlg/utils";

import { useFolderSelection } from "~/folders/selection";
import { createNamedFolder } from "~/session/folder-catalog";
import { resolvedFolderIcon } from "~/session/folder-icon";
import { normalizeFolderPath } from "~/session/folders";
import {
  useFolderIcons,
  useFolderPaths,
  useSession,
  useUpdateSession,
} from "~/session/queries";
import { FolderPathLabel } from "~/shared/ui/folder-path-label";
import { useTabs } from "~/store/zustand/tabs";
import { TemplateIconGlyph } from "~/templates/template-icon";

const filterFolders = (value: string, search: string) => {
  const haystack = value.toLocaleLowerCase();
  const needle = search.toLocaleLowerCase();
  return haystack.includes(needle) ? 1 : 0;
};

export function FolderPicker({
  sessionId,
  align = "start",
}: {
  sessionId: string;
  align?: "start" | "end";
}) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const currentPath = normalizeFolderPath(
    useSession(sessionId)?.folder_id ?? "",
  );
  const folderIcons = useFolderIcons();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-tauri-drag-region="false"
          role="combobox"
          aria-expanded={open}
          aria-label={
            currentPath ? t`Folder: ${currentPath}` : t`Select folder`
          }
          title={currentPath ? currentPath : t`Select folder`}
          className={cn([
            "flex h-7 items-center rounded-md [&_svg]:size-3.5",
            currentPath
              ? "max-w-60 min-w-0 gap-1 px-1.5 @max-[480px]:w-7 @max-[480px]:gap-0 @max-[480px]:px-0"
              : "w-7 justify-center",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-100",
            open && "bg-muted text-foreground",
          ])}
        >
          {currentPath ? (
            <TemplateIconGlyph
              icon={resolvedFolderIcon(currentPath, folderIcons)}
              className="size-3.5 shrink-0"
            />
          ) : (
            <Folder className="size-3.5 shrink-0" />
          )}
          {currentPath ? (
            <FolderPathLabel
              path={currentPath}
              className="text-label @max-[480px]:sr-only"
            />
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 overflow-hidden p-0">
        <FolderPickerContent
          sessionId={sessionId}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function FolderPickerContent({
  sessionId,
  onClose,
  selectedPath,
  onSelectFolder,
}: {
  sessionId?: string;
  onClose: () => void;
  selectedPath?: string;
  onSelectFolder?: (folderPath: string) => void | Promise<void>;
}) {
  const { t } = useLingui();
  const [query, setQuery] = useState("");
  const folderId = useSession(sessionId ?? "")?.folder_id ?? "";
  const folderPaths = useFolderPaths();
  const folderIcons = useFolderIcons();
  const updateSession = useUpdateSession(sessionId ?? "");
  const openNew = useTabs((state) => state.openNew);
  const setSelectedPath = useFolderSelection((state) => state.setSelectedPath);
  const currentPath = normalizeFolderPath(selectedPath ?? folderId) ?? "";
  const [highlighted, setHighlighted] = useState(currentPath);
  const folders = useMemo(() => {
    if (currentPath && !folderPaths.includes(currentPath)) {
      return collectWithCurrent(folderPaths, currentPath);
    }
    return folderPaths;
  }, [currentPath, folderPaths]);
  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeFolderPath(trimmedQuery);
  const canCreateFolder =
    Boolean(normalizedQuery) && !folders.includes(normalizedQuery ?? "");
  const folderName = normalizedQuery ?? "";

  const handleSelect = useCallback(
    (nextFolderId: string) => {
      const normalized = normalizeFolderPath(nextFolderId);
      if (normalized === null) {
        return;
      }

      onClose();
      if (normalized === currentPath) {
        return;
      }

      void (async () => {
        try {
          if (normalized && !folderPaths.includes(normalized)) {
            await createNamedFolder(normalized);
            setSelectedPath(normalized);
          }
          if (onSelectFolder) {
            await onSelectFolder(normalized);
          } else if (sessionId) {
            await updateSession({ folder_id: normalized });
          }
        } catch (error) {
          console.error("[folder-picker] failed to update folder", error);
        }
      })();
    },
    [
      currentPath,
      folderPaths,
      onClose,
      onSelectFolder,
      setSelectedPath,
      updateSession,
    ],
  );

  const handleSeeAllFolders = useCallback(() => {
    onClose();
    if (currentPath) {
      setSelectedPath(currentPath);
    }
    openNew({ type: "folders" });
  }, [currentPath, onClose, openNew, setSelectedPath]);

  return (
    <div className="flex flex-col">
      <Command
        filter={filterFolders}
        value={highlighted}
        onValueChange={setHighlighted}
        className="rounded-[inherit] border-0 bg-transparent **:[[cmdk-input-wrapper]]:h-8 **:[[cmdk-input-wrapper]]:px-2.5"
      >
        <CommandInput
          placeholder={t`Search or create folder`}
          value={query}
          onValueChange={setQuery}
          className="h-8 py-0"
        />
        <CommandList className="p-1">
          <CommandEmpty className="text-muted-foreground text-body px-2.5 py-2 text-start">
            {trimmedQuery
              ? normalizedQuery === null
                ? t`Enter a valid folder name.`
                : t`No folders found.`
              : t`No folders yet.`}
          </CommandEmpty>
          {folders.length > 0 ? (
            <CommandGroup>
              {folders.map((path) => (
                <CommandItem
                  key={path}
                  value={path}
                  onSelect={() =>
                    handleSelect(path === currentPath ? "" : path)
                  }
                  className="cursor-pointer"
                >
                  <TemplateIconGlyph
                    icon={resolvedFolderIcon(path, folderIcons)}
                    className="size-4 opacity-70"
                  />
                  <FolderPathLabel path={path} className="flex-1" />
                  {path === currentPath ? (
                    <Check className="size-4 shrink-0" />
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {canCreateFolder && normalizedQuery ? (
            <CommandGroup>
              <CommandItem
                value={`create-folder ${normalizedQuery}`}
                onSelect={() => handleSelect(normalizedQuery)}
                className="cursor-pointer"
              >
                <Plus className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  {t`Create "${folderName}"`}
                </span>
              </CommandItem>
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
      <button
        type="button"
        onClick={handleSeeAllFolders}
        className={cn([
          "text-label flex w-full items-center justify-center gap-1 px-3 py-1.5 font-medium",
          "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
        ])}
      >
        {t`See all folders`}
        <CaretRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function collectWithCurrent(folderPaths: string[], currentPath: string) {
  return [...folderPaths, currentPath].sort((left, right) =>
    left.localeCompare(right),
  );
}
