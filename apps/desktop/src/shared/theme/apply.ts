import { resolveIsDarkMode } from "./resolve";

import { getStoredSettingValues } from "~/settings/queries";
import { ThemePreference } from "~/shared/enums";

const THEME_STORAGE_KEY = "cue-theme";
const LEGACY_THEME_STORAGE_KEY = "hypr-theme";
const THEME_BOOTSTRAP_TIMEOUT_MS = 150;

/** Keep `public/theme-boot.js` aligned with normalizeThemePreference + resolveIsDarkMode. */

export function readStoredThemePreference(): ThemePreference {
  const stored =
    localStorage.getItem(THEME_STORAGE_KEY) ??
    localStorage.getItem("anarlog-theme") ??
    localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
  return normalizeThemePreference(stored);
}

export function normalizeThemePreference(
  stored: string | null,
): ThemePreference {
  if (
    stored === ThemePreference.Light ||
    stored === ThemePreference.Dark ||
    stored === ThemePreference.System
  ) {
    return stored;
  }
  return ThemePreference.System;
}

export function resolveBootIsDark(
  stored: string | null,
  prefersDark: boolean,
): boolean {
  return resolveIsDarkMode(normalizeThemePreference(stored), prefersDark);
}

export function writeStoredThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore unavailable storage in tests or restricted webviews.
  }
}

export function applyDocumentTheme(
  theme: ThemePreference,
  prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
): boolean {
  const isDark = resolveIsDarkMode(theme, prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  return isDark;
}

async function loadThemeFromSettings(): Promise<void> {
  try {
    const stored = await getStoredSettingValues();
    const preference = normalizeThemePreference(
      stored.hasValues.has("theme") ? (stored.values.theme ?? null) : null,
    );
    applyDocumentTheme(preference);
    writeStoredThemePreference(preference);
  } catch {
    // Non-Tauri dev sessions can skip persisted theme bootstrap.
  }
}

export async function bootstrapThemeFromSettings({
  timeoutMs = THEME_BOOTSTRAP_TIMEOUT_MS,
}: {
  timeoutMs?: number;
} = {}): Promise<void> {
  const themeLoad = loadThemeFromSettings();

  if (timeoutMs <= 0) {
    await themeLoad;
    return;
  }

  await Promise.race([
    themeLoad,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
