import type { SidebarNotesGroupBy } from "./note-filter";

import { normalizeFolderPath } from "~/session/folders";

export function parseSessionTagNames(
  value: string | null | undefined,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const names = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry !== "string") {
        continue;
      }
      const name = entry.trim();
      if (name) {
        names.add(name);
      }
    }

    return [...names].sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function resolveSidebarItemMeta({
  folderId,
  tags,
  showFolder,
  showTags,
  groupBy,
}: {
  folderId?: string | null;
  tags?: string[] | null;
  showFolder: boolean;
  showTags: boolean;
  groupBy: SidebarNotesGroupBy;
}): { folder: string; tags: string[] } {
  return {
    folder:
      showFolder && groupBy !== "folder"
        ? (normalizeFolderPath(folderId ?? "") ?? "")
        : "",
    tags: showTags
      ? [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))]
      : [],
  };
}

const SIDEBAR_VISIBLE_TAGS = 2;

// A one-line tag row truncates; name the first tags and count the rest so
// "+3" says there is more instead of an ellipsis hiding it.
export function formatSidebarItemTags(tags: string[]): {
  text: string;
  overflow: number;
} {
  return {
    text: tags
      .slice(0, SIDEBAR_VISIBLE_TAGS)
      .map((tag) => `#${tag}`)
      .join(" "),
    overflow: Math.max(0, tags.length - SIDEBAR_VISIBLE_TAGS),
  };
}
