import type { IslandDisplay } from "@anlg/plugin-windows";

export const FOLLOW_POINTER = "pointer";
const UNDER_CAMERA = "camera";

export function getIslandDisplayOptions(
  displays: IslandDisplay[],
  labels: { camera: string; pointer: string },
): { value: string; label: string }[] {
  return [
    ...displays.map((display) => ({
      value: display.id,
      label: display.hasCamera
        ? `${display.name} (${labels.camera})`
        : display.name,
    })),
    { value: FOLLOW_POINTER, label: labels.pointer },
  ];
}

// Mirrors the island's own choice: the stored display while it is connected,
// otherwise the one with the camera, otherwise the main display (listed first).
export function getSelectedIslandDisplay(
  stored: string,
  displays: IslandDisplay[],
): string {
  if (stored === FOLLOW_POINTER) return FOLLOW_POINTER;
  if (displays.some((display) => display.id === stored)) return stored;
  const fallback =
    displays.find((display) => display.hasCamera) ?? displays[0];
  return fallback?.id ?? UNDER_CAMERA;
}
