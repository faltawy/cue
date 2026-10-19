// @ts-ignore virtual module provided by the Vite changelog plugin
import { latestContent, latestVersion } from "virtual:changelog";

import { processContent } from "@anlg/changelog";

export function useChangelogContent(version: string) {
  const parsed =
    version === latestVersion &&
    typeof latestContent === "string" &&
    latestContent
      ? processContent(latestContent)
      : null;
  return parsed?.content ?? null;
}
