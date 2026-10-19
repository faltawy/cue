import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";
import { getIdentifier } from "@tauri-apps/api/app";

import { cn } from "@anlg/utils";

import { useSetSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import {
  type AppIconPreference,
  normalizeAppIconPreference,
  resolveAppIconName,
} from "~/shared/theme/icon";
import { applyAppIconPreference } from "~/shared/theme/provider";
import type { ThemePreference } from "~/shared/theme/resolve";

const APP_ICON_OPTIONS = [
  "default",
  "stable",
  "dev",
  "staging",
] as const satisfies readonly AppIconPreference[];

export function AppIconSelector() {
  const { t } = useLingui();
  const value = normalizeAppIconPreference(useConfigValue("app_icon"));
  const storedTheme = useConfigValue("theme") as ThemePreference;
  const theme: ThemePreference =
    storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system";
  const setAppIcon = useSetSettingValue("app_icon");
  const { data: appIdentifier = "com.hyprnote.stable" } = useQuery({
    queryKey: ["tauri", "app-identifier"],
    queryFn: getIdentifier,
    staleTime: Infinity,
  });
  const labels = {
    default: t`Default`,
    stable: t`White`,
    dev: t`Amber`,
    staging: t`Silver`,
  };
  const defaultIconName = resolveAppIconName("default", appIdentifier);
  const selectedIconName = resolveAppIconName(value, appIdentifier);
  const options = APP_ICON_OPTIONS.filter(
    (option) => option === "default" || option !== defaultIconName,
  );

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-[15px] font-semibold">
          <Trans>App icon</Trans>
        </h3>
        <p className="text-muted-foreground mt-1 text-sm">
          <Trans>Choose how Cue appears in the Dock.</Trans>
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t`App icon`}
        className="flex flex-wrap gap-4"
      >
        {options.map((option) => {
          const previewName = resolveAppIconName(option, appIdentifier);
          const selected = previewName === selectedIconName;

          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={labels[option]}
              className={cn([
                "group flex cursor-pointer flex-col items-center gap-2 rounded-lg p-1.5",
                "focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              ])}
              onClick={() => {
                void applyAppIconPreference(option, theme);
                setAppIcon(option);
              }}
            >
              <span
                className={cn([
                  "ring-offset-background flex size-16 items-center justify-center rounded-[18px] ring-2 ring-offset-2",
                  "ease-standard transition-[box-shadow,transform] duration-150 group-active:scale-[0.97]",
                  selected
                    ? "ring-warm"
                    : "group-hover:ring-border ring-transparent",
                ])}
              >
                <img
                  src={`/assets/app-icons/${previewName}-light.png`}
                  alt=""
                  draggable={false}
                  className="size-16 scale-[1.22] select-none"
                />
              </span>
              <span
                className={cn([
                  "text-xs",
                  selected ? "text-foreground" : "text-muted-foreground",
                ])}
              >
                {labels[option]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
