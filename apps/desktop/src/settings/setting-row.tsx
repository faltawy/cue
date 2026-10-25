import { type ReactNode, useId } from "react";

import { Switch } from "@anlg/ui/components/ui/switch";
import { cn } from "@anlg/utils";

import { SettingControlWidth } from "~/settings/enums";

export const SETTING_CONTROL_CLASS = "h-8 w-full";

export function SettingRow({
  title,
  description,
  controlWidth = SettingControlWidth.Fixed,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  controlWidth?: SettingControlWidth;
  children: (labelProps: {
    "aria-labelledby": string;
    "aria-describedby": string | undefined;
  }) => ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div
      className={cn([
        "flex w-full min-w-0 justify-between gap-4",
        controlWidth === SettingControlWidth.Fixed
          ? "flex-col items-stretch gap-2 @md:flex-row @md:items-center @md:gap-4"
          : "items-center",
      ])}
    >
      <div className="min-w-0 flex-1">
        <h3 id={titleId} className="text-ui font-medium">
          {title}
        </h3>
        {description && (
          <p
            id={descriptionId}
            className="text-muted-foreground text-label mt-0.5"
          >
            {description}
          </p>
        )}
      </div>
      <div
        className={cn([
          "flex justify-end",
          controlWidth === SettingControlWidth.Fixed &&
            "w-full min-w-0 @md:w-48",
          controlWidth !== SettingControlWidth.Fixed && "shrink-0",
        ])}
      >
        {children({
          "aria-labelledby": titleId,
          "aria-describedby": description ? descriptionId : undefined,
        })}
      </div>
    </div>
  );
}

export function SettingSwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow
      title={title}
      description={description}
      controlWidth={SettingControlWidth.Content}
    >
      {(labelProps) => (
        <Switch
          {...labelProps}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      )}
    </SettingRow>
  );
}
