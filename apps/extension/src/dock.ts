import { animate } from "motion";

export enum PanelDock {
  Bottom = "bottom",
  Side = "side",
}

export type DockRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const STRIP_HEIGHT = 44;
const EDGE = 16;
// Meet's top bar and its call controls; the panel never covers either.
const MEET_TOP = 64;
const MEET_CONTROLS = 88;
const SHEET_WIDTH = 560;
const SHEET_HEIGHT = 620;
const SIDE_WIDTH = 380;
const IDLE_HEIGHT = 360;

export function dockRect(
  dock: PanelDock,
  state: { collapsed: boolean; connected: boolean; rtl: boolean },
  viewport: { width: number; height: number },
): DockRect {
  const column = Math.max(
    STRIP_HEIGHT,
    viewport.height - MEET_TOP - MEET_CONTROLS,
  );
  const width = Math.max(
    0,
    Math.min(
      dock === PanelDock.Bottom ? SHEET_WIDTH : SIDE_WIDTH,
      viewport.width - EDGE * 2,
    ),
  );
  const open =
    dock === PanelDock.Bottom ? Math.min(SHEET_HEIGHT, column) : column;
  const height = state.collapsed
    ? STRIP_HEIGHT
    : state.connected
      ? open
      : Math.min(IDLE_HEIGHT, open);
  // The side dock sits where Meet opens its own side panels: the inline end.
  const left =
    dock === PanelDock.Bottom
      ? Math.round((viewport.width - width) / 2)
      : state.rtl
        ? EDGE
        : viewport.width - EDGE - width;
  return {
    left,
    top: viewport.height - MEET_CONTROLS - height,
    width,
    height,
  };
}

const px = (rect: DockRect) => ({
  left: `${rect.left}px`,
  top: `${rect.top}px`,
  width: `${rect.width}px`,
  height: `${rect.height}px`,
});

export function placeAt(element: HTMLElement, rect: DockRect) {
  Object.assign(element.style, px(rect));
}

// One shared-element move between docks and between the strip and the open panel.
export function moveTo(element: HTMLElement, rect: DockRect) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    placeAt(element, rect);
    return animate(element, { opacity: [0, 1] }, { duration: 0.15 });
  }
  return animate(element, px(rect), {
    type: "spring",
    visualDuration: 0.35,
    bounce: 0.15,
  });
}
