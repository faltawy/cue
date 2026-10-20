import { Trans, useLingui } from "@lingui/react/macro";
import { type MouseEvent, useMemo, useState } from "react";

import {
  CaretDown,
  CaretRight,
  DotsThree,
  Notebook,
  Plus,
} from "@anlg/ui/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { rowClassName } from "@anlg/ui/components/ui/row";
import { cn } from "@anlg/utils";

import { FolderNameDialog } from "./folder-name-dialog";
import {
  buildFolderTree,
  type FolderNode,
  folderMoveTargets,
  visibleFolderNodes,
} from "./folder-tree";
import { useSidebarNotes } from "./note-filter";
import { SidebarSection } from "./sidebar-section";

import { useFolderSelection } from "~/folders/selection";
import {
  createNamedFolder,
  deleteNamedFolder,
  renameNamedFolder,
} from "~/session/folder-catalog";
import { resolvedFolderIcon } from "~/session/folder-icon";
import {
  ancestorFolderPaths,
  isFolderOrDescendant,
  parentFolderPath,
  remapFolderPath,
} from "~/session/folders";
import {
  useFolderIcons,
  useFolderNoteCounts,
  useFolderPaths,
} from "~/session/queries";
import { DestructiveConfirmationDialog } from "~/shared/ui/destructive-confirmation-dialog";
import { FolderPathLabel } from "~/shared/ui/folder-path-label";
import {
  type TemplateIcon,
  TemplateIconGlyph,
} from "~/templates/template-icon";

type FolderDialog =
  | { kind: "create"; parent: string }
  | { kind: "rename"; path: string; name: string }
  | { kind: "delete"; path: string };

const INDENT_PX = 12;

function joinFolderPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

export function SidebarFolderNav() {
  const { t } = useLingui();
  const folders = useFolderPaths();
  const counts = useFolderNoteCounts();
  const persistedIcons = useFolderIcons();
  const iconOverrides = useFolderSelection((state) => state.iconOverrides);
  const rekeyIconOverride = useFolderSelection(
    (state) => state.rekeyIconOverride,
  );
  const markFolderDeleted = useFolderSelection(
    (state) => state.markFolderDeleted,
  );
  const folderFilter = useSidebarNotes((state) => state.folderFilter);
  const setFolderFilter = useSidebarNotes((state) => state.setFolderFilter);
  const expanded = useSidebarNotes(
    (state) => !state.collapsedSections.includes("folders"),
  );
  const setSectionExpanded = useSidebarNotes(
    (state) => state.setSectionExpanded,
  );
  const expandedFolders = useSidebarNotes((state) => state.expandedFolders);
  const setFolderExpanded = useSidebarNotes((state) => state.setFolderExpanded);
  const [dialog, setDialog] = useState<FolderDialog | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = useMemo(() => {
    const open = new Set(expandedFolders);
    if (folderFilter) {
      ancestorFolderPaths(parentFolderPath(folderFilter)).forEach((path) =>
        open.add(path),
      );
    }
    return visibleFolderNodes(buildFolderTree(folders, counts), open);
  }, [counts, expandedFolders, folderFilter, folders]);
  const totalCount = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts],
  );

  const followMove = (from: string, to: string) => {
    rekeyIconOverride(from, to);
    const filter = useSidebarNotes.getState().folderFilter;
    if (filter && isFolderOrDescendant(filter, from)) {
      setFolderFilter(remapFolderPath(filter, from, to));
    }
  };

  const moveFolder = async (path: string, parent: string) => {
    const name = path.slice(parentFolderPath(path).length).replace(/^\//, "");
    const moved = await renameNamedFolder(path, joinFolderPath(parent, name));
    followMove(path, moved);
    if (parent) setFolderExpanded(parent, true);
  };

  return (
    <SidebarSection
      title={t`Folders`}
      expanded={expanded}
      onExpandedChange={(next) => setSectionExpanded("folders", next)}
      action={
        <button
          type="button"
          aria-label={t`New folder`}
          onClick={() => setDialog({ kind: "create", parent: "" })}
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded-md"
        >
          <Plus size={14} />
        </button>
      }
    >
      <ul className="flex flex-col">
        <li>
          <button
            type="button"
            aria-current={folderFilter === null ? "true" : undefined}
            onClick={() => setFolderFilter(null)}
            className={cn([
              rowClassName({ selected: folderFilter === null }),
              "gap-1 pe-1",
            ])}
          >
            <span aria-hidden className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Notebook className="text-body size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                <Trans>All notes</Trans>
              </span>
              <span className="text-muted-foreground text-label shrink-0 pe-1 tabular-nums">
                {totalCount}
              </span>
            </span>
          </button>
        </li>
        {rows.map((node) => (
          <FolderRow
            key={node.path}
            node={node}
            selected={folderFilter === node.path}
            expanded={
              expandedFolders.includes(node.path) ||
              Boolean(
                folderFilter &&
                folderFilter !== node.path &&
                isFolderOrDescendant(folderFilter, node.path),
              )
            }
            icon={resolvedFolderIcon(node.path, persistedIcons, iconOverrides)}
            moveTargets={folderMoveTargets(folders, node.path)}
            onSelect={() => {
              if (folderFilter === node.path) {
                setFolderFilter(null);
                return;
              }
              setFolderFilter(node.path);
              if (node.children.length > 0) setFolderExpanded(node.path, true);
            }}
            onExpandedChange={(next) => setFolderExpanded(node.path, next)}
            onNewSubfolder={() =>
              setDialog({ kind: "create", parent: node.path })
            }
            onRename={() =>
              setDialog({ kind: "rename", path: node.path, name: node.name })
            }
            onMove={(parent) => {
              void moveFolder(node.path, parent).catch((error: unknown) => {
                console.error("[sidebar] failed to move folder", error);
              });
            }}
            onDelete={() => setDialog({ kind: "delete", path: node.path })}
          />
        ))}
      </ul>

      <FolderNameDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        title={
          dialog?.kind === "rename"
            ? t`Rename folder`
            : dialog?.kind === "create" && dialog.parent
              ? t`New subfolder in ${dialog.parent}`
              : t`New folder`
        }
        confirmLabel={dialog?.kind === "rename" ? t`Rename` : t`Create`}
        initialValue={dialog?.kind === "rename" ? dialog.name : ""}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onSubmit={async (name) => {
          if (dialog?.kind === "create") {
            await createNamedFolder(joinFolderPath(dialog.parent, name));
            if (dialog.parent) setFolderExpanded(dialog.parent, true);
          } else if (dialog?.kind === "rename") {
            const renamed = await renameNamedFolder(
              dialog.path,
              joinFolderPath(parentFolderPath(dialog.path), name),
            );
            followMove(dialog.path, renamed);
          }
        }}
      />
      <DestructiveConfirmationDialog
        open={dialog?.kind === "delete"}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={<Trans>Delete folder</Trans>}
        description={
          <Trans id="Notes stay in All notes. Materials in this folder will be deleted.">
            Notes stay in All notes. This folder, its nested folders, and all
            their materials will be deleted.
          </Trans>
        }
        confirmLabel={<Trans>Delete folder</Trans>}
        isPending={deleting}
        onConfirm={() => {
          if (dialog?.kind !== "delete") return;
          const path = dialog.path;
          setDeleting(true);
          void deleteNamedFolder(path)
            .then(() => {
              markFolderDeleted(path);
              const filter = useSidebarNotes.getState().folderFilter;
              if (filter && isFolderOrDescendant(filter, path)) {
                setFolderFilter(null);
              }
              setDialog(null);
            })
            .catch((error: unknown) => {
              console.error("[sidebar] failed to delete folder", error);
            })
            .finally(() => setDeleting(false));
        }}
      />
    </SidebarSection>
  );
}

function FolderRow({
  node,
  selected,
  expanded,
  icon,
  moveTargets,
  onSelect,
  onExpandedChange,
  onNewSubfolder,
  onRename,
  onMove,
  onDelete,
}: {
  node: FolderNode;
  selected: boolean;
  expanded: boolean;
  icon: TemplateIcon;
  moveTargets: string[];
  onSelect: () => void;
  onExpandedChange: (expanded: boolean) => void;
  onNewSubfolder: () => void;
  onRename: () => void;
  onMove: (parent: string) => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const [menuOpen, setMenuOpen] = useState(false);
  const hasChildren = node.children.length > 0;
  const isTopLevel = node.depth === 0;

  return (
    <li
      className="group relative"
      onContextMenu={(event: MouseEvent) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <div
        className={cn([rowClassName({ selected }), "gap-1 pe-1"])}
        style={{ paddingInlineStart: 8 + node.depth * INDENT_PX }}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={
              expanded ? t`Collapse ${node.name}` : t`Expand ${node.name}`
            }
            aria-expanded={expanded}
            onClick={() => onExpandedChange(!expanded)}
            className="text-muted-foreground hover:text-foreground flex size-4 shrink-0 items-center justify-center rounded-sm"
          >
            {expanded ? (
              <CaretDown className="size-3" />
            ) : (
              <CaretRight className="size-3 rtl:rotate-180" />
            )}
          </button>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <button
          type="button"
          aria-current={selected ? "true" : undefined}
          title={node.path}
          onClick={onSelect}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-start"
        >
          <TemplateIconGlyph
            icon={icon}
            className="text-body size-4 shrink-0"
          />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <span
            className={cn([
              "text-muted-foreground text-label shrink-0 pe-1 tabular-nums",
              "group-focus-within:hidden group-hover:hidden",
              menuOpen && "hidden",
            ])}
          >
            {node.count}
          </span>
        </button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t`${node.name} folder actions`}
              className={cn([
                "text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-sm",
                "hidden group-focus-within:flex group-hover:flex",
                menuOpen && "flex",
              ])}
            >
              <DotsThree className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onSelect={onNewSubfolder}>
              <Trans>New subfolder</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRename}>
              <Trans>Rename…</Trans>
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                disabled={isTopLevel && moveTargets.length === 0}
              >
                <Trans>Move to</Trans>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  {isTopLevel ? null : (
                    <DropdownMenuItem onSelect={() => onMove("")}>
                      <Trans>Top level</Trans>
                    </DropdownMenuItem>
                  )}
                  {moveTargets.map((target) => (
                    <DropdownMenuItem
                      key={target}
                      onSelect={() => onMove(target)}
                    >
                      <FolderPathLabel path={target} />
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trans>Delete…</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
