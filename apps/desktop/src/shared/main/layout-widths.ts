import type { Tab } from "~/store/zustand/tabs";
import { TabType } from "~/store/zustand/tabs/enums";

export const NOTE_SURFACE_MIN_WIDTH_PX = 500;
export const SETTINGS_SURFACE_MIN_WIDTH_PX = 700;

export function usesNoteSurfaceMinWidth(tab: Pick<Tab, "type"> | null) {
  return tab?.type === TabType.Sessions || tab?.type === TabType.Empty;
}

export function getMainContentMinWidth(tab: Pick<Tab, "type"> | null) {
  return usesNoteSurfaceMinWidth(tab) ? NOTE_SURFACE_MIN_WIDTH_PX : undefined;
}

export function boundedMinWidthPx(px: number): string {
  return `min(${px}px, 100%)`;
}
