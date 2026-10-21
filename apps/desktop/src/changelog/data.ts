// @ts-ignore virtual module provided by the Vite changelog plugin
import { changelogs } from "virtual:changelog";

import { processContent } from "@anlg/changelog";

export function hasChangelogFor(version: string): boolean {
  return (
    typeof changelogs[version] === "string" && Boolean(changelogs[version])
  );
}

export function useChangelogContent(version: string) {
  const content = changelogs[version];
  const parsed = typeof content === "string" ? processContent(content) : null;
  return parsed?.content ?? null;
}

export function availableChangelogVersions(): string[] {
  return Object.keys(changelogs).sort((left, right) =>
    right.localeCompare(left, undefined, { numeric: true }),
  );
}
