// @ts-ignore virtual module provided by the Vite changelog plugin
import { latestContent, latestVersion } from "virtual:changelog";

import { processContent } from "@anlg/changelog";

export function hasChangelogFor(version: string): boolean {
  return (
    version === latestVersion &&
    typeof latestContent === "string" &&
    Boolean(latestContent)
  );
}

export function useChangelogContent(version: string) {
  const parsed = hasChangelogFor(version)
    ? processContent(latestContent)
    : null;
  return parsed?.content ?? null;
}
