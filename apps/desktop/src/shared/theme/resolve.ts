import { ThemePreference } from "~/shared/enums";
export { ThemePreference };

export function resolveIsDarkMode(
  theme: ThemePreference,
  prefersDark: boolean,
): boolean {
  if (theme === ThemePreference.Dark) {
    return true;
  }
  if (theme === ThemePreference.Light) {
    return false;
  }
  return prefersDark;
}
