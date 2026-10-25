import { resolveIsDarkMode } from "./resolve";

import { AppIconPreference, type ThemePreference } from "~/shared/enums";

export { AppIconPreference };

export function normalizeAppIconPreference(
  value: string | null | undefined,
): AppIconPreference {
  switch (value) {
    case AppIconPreference.Stable:
    case AppIconPreference.Dev:
    case AppIconPreference.Staging:
      return value;
    default:
      return AppIconPreference.Default;
  }
}

export function resolveAppIconName(
  icon: AppIconPreference,
  appIdentifier: string,
): Exclude<AppIconPreference, AppIconPreference.Default> {
  if (icon !== AppIconPreference.Default) {
    return icon;
  }
  if (appIdentifier.endsWith(".dev")) {
    return AppIconPreference.Dev;
  }
  if (
    appIdentifier.endsWith(".staging") ||
    appIdentifier.endsWith(".nightly")
  ) {
    return AppIconPreference.Staging;
  }
  return AppIconPreference.Stable;
}

/** `systemIsDark` is the Dock's appearance, used when the theme follows the system. */
export function resolveDockIconName(
  icon: AppIconPreference,
  theme: ThemePreference,
  systemIsDark: boolean,
  appIdentifier: string,
): string {
  const name = resolveAppIconName(icon, appIdentifier);
  return resolveIsDarkMode(theme, systemIsDark) ? `${name}-dark` : name;
}
