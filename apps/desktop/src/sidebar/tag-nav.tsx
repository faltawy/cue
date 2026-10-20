import { useLingui } from "@lingui/react/macro";

import { Hash } from "@anlg/ui/components/icons";
import { rowClassName } from "@anlg/ui/components/ui/row";
import { cn } from "@anlg/utils";

import { useSidebarNotes } from "./note-filter";
import { SidebarSection } from "./sidebar-section";

import { sameTag, useTagCounts } from "~/session/tags";

export function SidebarTagNav() {
  const { t } = useLingui();
  const tags = useTagCounts();
  const tagFilter = useSidebarNotes((state) => state.tagFilter);
  const setTagFilter = useSidebarNotes((state) => state.setTagFilter);
  const expanded = useSidebarNotes(
    (state) => !state.collapsedSections.includes("tags"),
  );
  const setSectionExpanded = useSidebarNotes(
    (state) => state.setSectionExpanded,
  );

  if (tags.length === 0 && tagFilter === null) {
    return null;
  }
  const rows =
    tagFilter !== null && !tags.some((tag) => sameTag(tag.name, tagFilter))
      ? [...tags, { name: tagFilter, count: 0 }]
      : tags;

  return (
    <SidebarSection
      title={t`Tags`}
      expanded={expanded}
      onExpandedChange={(next) => setSectionExpanded("tags", next)}
    >
      <ul className="flex flex-col">
        {rows.map((tag) => {
          const selected = tagFilter !== null && sameTag(tagFilter, tag.name);
          return (
            <li key={tag.name}>
              <button
                type="button"
                aria-current={selected ? "true" : undefined}
                aria-label={
                  selected
                    ? t`Stop filtering by ${tag.name}`
                    : t`Show notes tagged ${tag.name}`
                }
                onClick={() => setTagFilter(selected ? null : tag.name)}
                className={cn([rowClassName({ selected }), "gap-1 pe-1"])}
              >
                <span aria-hidden className="size-4 shrink-0" />
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Hash className="text-muted-foreground size-4 shrink-0" />
                  <bdi className="min-w-0 flex-1 truncate">{tag.name}</bdi>
                  <span className="text-muted-foreground text-label shrink-0 pe-1 tabular-nums">
                    {tag.count}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </SidebarSection>
  );
}
