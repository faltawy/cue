import { Trans, useLingui } from "@lingui/react/macro";

import { IconWeight, Check } from "@anlg/ui/components/icons";
import { cn } from "@anlg/utils";

import { useSetSettingValue } from "~/settings/queries";
import { useConfigValue } from "~/shared/config";
import { ThemePreference } from "~/shared/enums";
import { normalizeAppIconPreference } from "~/shared/theme/icon";
import { applyThemePreference } from "~/shared/theme/provider";

const THEME_OPTIONS = [
  ThemePreference.Light,
  ThemePreference.Dark,
  ThemePreference.System,
] as const satisfies readonly ThemePreference[];

export function ThemeSelector() {
  const { t } = useLingui();
  const storedValue = useConfigValue("theme") as ThemePreference;
  const value = THEME_OPTIONS.includes(storedValue) ? storedValue : "system";
  const appIcon = normalizeAppIconPreference(useConfigValue("app_icon"));
  const setTheme = useSetSettingValue("theme");
  const options = [
    {
      value: ThemePreference.Light,
      label: t`Light`,
      description: t`Bright canvas`,
    },
    {
      value: ThemePreference.Dark,
      label: t`Dark`,
      description: t`Low-light canvas`,
    },
    {
      value: ThemePreference.System,
      label: t`System`,
      description: t`Match your device`,
    },
  ] as const satisfies readonly {
    value: ThemePreference;
    label: string;
    description: string;
  }[];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-title">
          <Trans>Theme</Trans>
        </h3>
        <p className="text-muted-foreground text-ui mt-1">
          <Trans>Choose how Cue looks on this device.</Trans>
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t`Color theme`}
        className="grid gap-3 sm:grid-cols-3"
      >
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={cn([
                "group bg-background text-foreground relative cursor-pointer overflow-hidden rounded-lg border text-start transition-colors duration-100",
                selected
                  ? "border-foreground"
                  : "border-border hover:border-input",
              ])}
              onClick={() => {
                void applyThemePreference(option.value, appIcon);
                setTheme(option.value);
              }}
            >
              <ThemePreview theme={option.value} />
              <div className="border-border flex items-center gap-2 border-t px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="text-ui font-medium">{option.label}</div>
                  <div className="text-muted-foreground text-label">
                    {option.description}
                  </div>
                </div>
                <span
                  aria-hidden="true"
                  className={cn([
                    "bg-primary text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-full transition-opacity duration-150",
                    selected ? "opacity-100" : "opacity-0",
                  ])}
                >
                  <Check className="size-2.5" weight={IconWeight.Bold} />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <div aria-hidden="true" className="relative h-28 overflow-hidden">
      <PreviewCanvas dark={theme === ThemePreference.Dark} />
      {theme === ThemePreference.System ? (
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
          <PreviewCanvas dark />
        </div>
      ) : null}
    </div>
  );
}

// Drawn with the real tokens inside a light or dark scope, so the preview
// always matches the app. The traffic lights are macOS's own colours.
function PreviewCanvas({ dark }: { dark: boolean }) {
  return (
    <div
      className={cn([
        dark ? "dark" : "light",
        "bg-background text-foreground absolute inset-0 flex flex-col p-3",
      ])}
    >
      <div className="mb-3 flex gap-1">
        <span className="size-1.5 rounded-full bg-[#ff5f57]" />
        <span className="size-1.5 rounded-full bg-[#febc2e]" />
        <span className="size-1.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="flex flex-1 gap-3">
        <div className="bg-sidebar w-1/4 rounded-md" />
        <div className="flex flex-1 flex-col gap-2 py-1">
          <span className="bg-foreground/70 h-1.5 w-10 rounded-full" />
          <span className="bg-border h-1 w-4/5 rounded-full" />
          <span className="bg-border h-1 w-3/5 rounded-full" />
          <span className="bg-border h-1 w-2/3 rounded-full" />
        </div>
      </div>
    </div>
  );
}
