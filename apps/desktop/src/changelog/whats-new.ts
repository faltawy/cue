import { getVersion } from "@tauri-apps/api/app";

import { hasChangelogFor } from "./data";

import type { TabInput } from "~/store/zustand/tabs";

const LAST_SEEN_VERSION_KEY = "cue.whats-new.last-seen-version";

export function whatsNewTab(
  current: string,
  previous: string | null = null,
): TabInput {
  return { type: "changelog", state: { previous, current } };
}

export async function openWhatsNew(openNew: (tab: TabInput) => void) {
  openNew(whatsNewTab(await getVersion()));
}

// A fresh install has no last-seen version, so only an update announces.
export function shouldAnnounceUpdate(
  lastSeen: string | null,
  current: string,
  hasNotes: boolean,
): boolean {
  return lastSeen !== null && lastSeen !== current && hasNotes;
}

export async function openWhatsNewAfterUpdate(
  openNew: (tab: TabInput) => void,
) {
  const current = await getVersion();
  const lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
  localStorage.setItem(LAST_SEEN_VERSION_KEY, current);
  if (shouldAnnounceUpdate(lastSeen, current, hasChangelogFor(current))) {
    openNew(whatsNewTab(current, lastSeen));
  }
}
