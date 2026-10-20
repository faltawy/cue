import { Trans, useLingui } from "@lingui/react/macro";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  commands as detectCommands,
  type InstalledApp,
  type Result,
} from "@anlg/plugin-detect";
import { commands as notificationCommands } from "@anlg/plugin-notification";
import { X } from "@anlg/ui/components/icons";
import { Badge } from "@anlg/ui/components/ui/badge";
import { Button } from "@anlg/ui/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@anlg/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@anlg/ui/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";
import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";
import { cn } from "@anlg/utils";

import {
  getIgnoredBundleIds,
  getIgnorableApps,
  toggleIgnoredApp,
} from "./notification-app-options";

import { useSetSettingValues } from "~/settings/queries";
import { SettingRow, SettingSwitchRow } from "~/settings/setting-row";
import {
  normalizeCompletionSoundName,
  previewCompletionSound,
} from "~/shared/completion-sound";
import { useConfigValues } from "~/shared/config";

export function NotificationSettingsView() {
  const { t } = useLingui();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const configs = useConfigValues([
    "notification_disabled",
    "notification_event",
    "notification_detect",
    "notification_summary_complete",
    "notification_coach_nudges",
    "notification_recording",
    "notification_completion_sound",
    "notification_completion_sound_name",
    "notification_bounce",
    "show_app_in_dock",
    "respect_dnd",
    "ignored_platforms",
    "included_platforms",
    "mic_active_threshold",
  ] as const);

  useMountEffect(() => {
    void notificationCommands.clearNotifications();
    return () => {
      void notificationCommands.clearNotifications();
    };
  });

  const { data: installedApps = [] } = useQuery({
    queryKey: ["settings", "all-installed-applications"],
    queryFn: detectCommands.listInstalledApplications,
    select: (result: Result<InstalledApp[], string>) => {
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const { data: defaultIgnoredBundleIds = [] } = useQuery({
    queryKey: ["settings", "default-ignored-bundle-ids"],
    queryFn: detectCommands.listDefaultIgnoredBundleIds,
    select: (result: Result<string[], string>) => {
      if (result.status === "error") {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const bundleIdToName = (bundleId: string) => {
    return installedApps.find((a) => a.id === bundleId)?.name ?? bundleId;
  };

  const isDefaultIgnored = (bundleId: string) => {
    return defaultIgnoredBundleIds.includes(bundleId);
  };

  const setSettingValues = useSetSettingValues();

  const form = useForm({
    defaultValues: {
      notification_disabled: configs.notification_disabled,
      notification_event: configs.notification_event,
      notification_detect: configs.notification_detect,
      notification_summary_complete: configs.notification_summary_complete,
      notification_coach_nudges: configs.notification_coach_nudges,
      notification_recording: configs.notification_recording,
      notification_completion_sound: configs.notification_completion_sound,
      notification_completion_sound_name: normalizeCompletionSoundName(
        configs.notification_completion_sound_name,
      ),
      notification_bounce: configs.notification_bounce,
      respect_dnd: configs.respect_dnd,
      ignored_platforms: configs.ignored_platforms,
      included_platforms: configs.included_platforms,
      mic_active_threshold: configs.mic_active_threshold,
    },
    listeners: {
      onChange: async ({ formApi }) => {
        void formApi.handleSubmit();
      },
    },
    onSubmit: async ({ value }) => {
      setSettingValues({
        notification_disabled: value.notification_disabled,
        notification_event: value.notification_event,
        notification_detect: value.notification_detect,
        notification_summary_complete: value.notification_summary_complete,
        notification_coach_nudges: value.notification_coach_nudges,
        notification_recording: value.notification_recording,
        notification_completion_sound: value.notification_completion_sound,
        notification_completion_sound_name:
          value.notification_completion_sound_name,
        notification_bounce: value.notification_bounce,
        respect_dnd: value.respect_dnd,
        ignored_platforms: JSON.stringify(value.ignored_platforms),
        included_platforms: JSON.stringify(value.included_platforms),
        mic_active_threshold: value.mic_active_threshold,
      });
    },
  });

  const handleToggleIgnoredApp = (
    bundleId: string,
    ignoredPlatforms: string[],
    includedPlatforms: string[],
  ) => {
    if (!bundleId) {
      return;
    }

    const {
      ignoredPlatforms: newIgnoredPlatforms,
      includedPlatforms: newIncludedPlatforms,
    } = toggleIgnoredApp({
      bundleId,
      ignoredPlatforms,
      includedPlatforms,
      defaultIgnoredBundleIds,
    });

    form.setFieldValue("ignored_platforms", newIgnoredPlatforms);
    form.setFieldValue("included_platforms", newIncludedPlatforms);
    void form.handleSubmit();
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="flex flex-col gap-6">
      <form.Field name="notification_disabled">
        {(field) => (
          <SettingSwitchRow
            title={<Trans>Disable all notifications</Trans>}
            description={
              <Trans>
                Hide all notification panels, Dock alerts, and completion
                sounds.
              </Trans>
            }
            checked={field.state.value}
            onChange={(disabled) => {
              field.handleChange(disabled);
              if (disabled) {
                void notificationCommands.clearNotifications();
              }
            }}
          />
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.values.notification_disabled}>
        {(notificationsDisabled) => (
          <>
            <form.Field name="notification_summary_complete">
              {(field) => (
                <SettingSwitchRow
                  title={<Trans>Summary complete</Trans>}
                  description={<Trans>Show when a summary is ready.</Trans>}
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_coach_nudges">
              {(field) => (
                <SettingSwitchRow
                  title={<Trans>Coach nudges</Trans>}
                  description={
                    <Trans>
                      Show what the coach suggests when its window isn't in
                      front.
                    </Trans>
                  }
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_event">
              {(field) => (
                <SettingSwitchRow
                  title={<Trans>Event notifications</Trans>}
                  description={
                    <Trans>Prepare for events with a 5-minute reminder.</Trans>
                  }
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_recording">
              {(field) => (
                <SettingSwitchRow
                  title={<Trans>Recording status prompts</Trans>}
                  description={
                    <Trans>
                      Ask before stopping when a meeting may have ended. When
                      alerts are off, Cue keeps listening.
                    </Trans>
                  }
                  checked={field.state.value}
                  onChange={field.handleChange}
                  disabled={notificationsDisabled}
                />
              )}
            </form.Field>

            <form.Field name="notification_completion_sound">
              {(field) => (
                <div className="flex flex-col gap-4">
                  <SettingSwitchRow
                    title={<Trans>Completion sound</Trans>}
                    description={
                      <Trans>
                        Play a sound when transcription or summaries finish.
                      </Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />

                  {field.state.value && (
                    <div className={cn(["border-muted ms-3 border-s-2 ps-4"])}>
                      <form.Field name="notification_completion_sound_name">
                        {(soundField) => (
                          <SettingRow
                            title={<Trans>Sound</Trans>}
                            description={
                              <Trans>Choose from five completion sounds.</Trans>
                            }
                          >
                            {(labelProps) => (
                              <div className="flex w-full items-center gap-2">
                                <Select
                                  value={soundField.state.value}
                                  onValueChange={(value) => {
                                    const sound =
                                      normalizeCompletionSoundName(value);
                                    soundField.handleChange(sound);
                                    previewCompletionSound(sound);
                                  }}
                                  disabled={notificationsDisabled}
                                >
                                  <SelectTrigger
                                    {...labelProps}
                                    className="min-w-0 flex-1"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent align="end">
                                    <SelectItem value="ready">
                                      <Trans>Ready</Trans>
                                    </SelectItem>
                                    <SelectItem value="success">
                                      <Trans>Success</Trans>
                                    </SelectItem>
                                    <SelectItem value="chime">
                                      <Trans>Chime</Trans>
                                    </SelectItem>
                                    <SelectItem value="sparkle">
                                      <Trans>Sparkle</Trans>
                                    </SelectItem>
                                    <SelectItem value="bloom">
                                      <Trans>Bloom</Trans>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={notificationsDisabled}
                                  onClick={() =>
                                    previewCompletionSound(
                                      soundField.state.value,
                                    )
                                  }
                                >
                                  <Trans>Preview</Trans>
                                </Button>
                              </div>
                            )}
                          </SettingRow>
                        )}
                      </form.Field>
                    </div>
                  )}
                </div>
              )}
            </form.Field>

            {configs.show_app_in_dock && (
              <form.Field name="notification_bounce">
                {(field) => (
                  <SettingSwitchRow
                    title={<Trans>Bounce app icon</Trans>}
                    description={
                      <Trans>
                        Get your attention when a summary is ready in the
                        background.
                      </Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />
                )}
              </form.Field>
            )}

            <form.Field name="notification_detect">
              {(field) => (
                <div className="flex flex-col gap-4">
                  <SettingSwitchRow
                    title={<Trans>Microphone detection</Trans>}
                    description={
                      <Trans>Detect meetings from microphone activity.</Trans>
                    }
                    checked={field.state.value}
                    onChange={field.handleChange}
                    disabled={notificationsDisabled}
                  />

                  {field.state.value && !notificationsDisabled && (
                    <div
                      className={cn(["border-muted ms-3 border-s-2 ps-4 pt-2"])}
                    >
                      <form.Field name="mic_active_threshold">
                        {(thresholdField) => (
                          <div className="mb-4 flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="text-ui font-medium">
                                <Trans>Detection delay</Trans>
                              </h4>
                              <p className="text-muted-foreground text-label">
                                <Trans>
                                  Wait before treating microphone activity as a
                                  meeting.
                                </Trans>
                              </p>
                            </div>
                            <Select
                              value={String(thresholdField.state.value)}
                              onValueChange={(v) =>
                                thresholdField.handleChange(Number(v))
                              }
                            >
                              <SelectTrigger className="w-[100px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent align="end">
                                <SelectItem value="5">5 sec</SelectItem>
                                <SelectItem value="10">10 sec</SelectItem>
                                <SelectItem value="15">15 sec</SelectItem>
                                <SelectItem value="30">30 sec</SelectItem>
                                <SelectItem value="60">1 min</SelectItem>
                                <SelectItem value="120">2 min</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </form.Field>

                      <div className="mb-3 flex flex-col gap-1">
                        <h4 className="text-ui font-medium">
                          <Trans>Exclude apps from detection</Trans>
                        </h4>
                        <p className="text-muted-foreground text-label">
                          <Trans>
                            Prevent selected apps from triggering meeting
                            detection.
                          </Trans>
                        </p>
                      </div>
                      <form.Subscribe selector={(state) => state.values}>
                        {(values) => {
                          const ignoredPlatforms = values.ignored_platforms;
                          const includedPlatforms = values.included_platforms;
                          const ignorableApps = getIgnorableApps({
                            installedApps,
                            ignoredPlatforms,
                            includedPlatforms,
                            inputValue: searchQuery,
                            defaultIgnoredBundleIds,
                          });
                          const ignoredBundleIds = getIgnoredBundleIds({
                            installedApps,
                            ignoredPlatforms,
                            includedPlatforms,
                            defaultIgnoredBundleIds,
                          });

                          return (
                            <div className="flex flex-col gap-3">
                              <Popover
                                open={searchOpen}
                                onOpenChange={setSearchOpen}
                              >
                                <PopoverTrigger asChild>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    aria-expanded={searchOpen}
                                    className={cn([
                                      "border-input focus-within:border-foreground flex min-h-8 w-full cursor-text flex-wrap items-center gap-1 rounded-md border px-1.5 py-1",
                                    ])}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" ||
                                        event.key === " "
                                      ) {
                                        event.preventDefault();
                                        setSearchOpen(true);
                                      }
                                    }}
                                  >
                                    {ignoredBundleIds.map(
                                      (bundleId: string) => {
                                        const isDefault =
                                          isDefaultIgnored(bundleId);
                                        return (
                                          <Badge
                                            key={bundleId}
                                            className="gap-1 pe-1"
                                            title={
                                              isDefault ? "default" : undefined
                                            }
                                          >
                                            {bundleIdToName(bundleId)}
                                            {isDefault && (
                                              <span className="text-tertiary-foreground">
                                                <Trans>(default)</Trans>
                                              </span>
                                            )}
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="hover:text-foreground size-3.5 p-0 hover:bg-transparent"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleToggleIgnoredApp(
                                                  bundleId,
                                                  ignoredPlatforms,
                                                  includedPlatforms,
                                                );
                                              }}
                                            >
                                              <X className="size-3" />
                                            </Button>
                                          </Badge>
                                        );
                                      },
                                    )}
                                    <span className="text-tertiary-foreground text-body px-1">
                                      <Trans>Search installed apps...</Trans>
                                    </span>
                                  </div>
                                </PopoverTrigger>
                                <PopoverContent
                                  align="start"
                                  className="overflow-hidden p-0"
                                  style={{
                                    width: "var(--radix-popover-trigger-width)",
                                  }}
                                >
                                  <Command className="rounded-[inherit] border-0 bg-transparent">
                                    <CommandInput
                                      placeholder={t`Search installed apps...`}
                                      value={searchQuery}
                                      onValueChange={setSearchQuery}
                                    />
                                    <CommandEmpty>
                                      <div className="text-muted-foreground text-ui px-2 py-1.5">
                                        <Trans>No apps found.</Trans>
                                      </div>
                                    </CommandEmpty>
                                    <CommandList>
                                      <CommandGroup className="max-h-[250px] overflow-y-auto">
                                        {ignorableApps.map((app) => (
                                          <CommandItem
                                            key={app.id}
                                            value={`${app.name} ${app.id}`}
                                            onSelect={() =>
                                              handleToggleIgnoredApp(
                                                app.id,
                                                ignoredPlatforms,
                                                includedPlatforms,
                                              )
                                            }
                                            className={cn([
                                              "cursor-pointer",
                                              "hover:bg-accent! focus:bg-accent! aria-selected:bg-transparent",
                                            ])}
                                          >
                                            <span className="flex-1 truncate">
                                              {app.name}
                                            </span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                          );
                        }}
                      </form.Subscribe>
                    </div>
                  )}
                </div>
              )}
            </form.Field>

            <div className="flex flex-col gap-6">
              <div className="flex items-center gap-4 pt-4 pb-2">
                <div className="border-muted min-w-0 flex-1 border-t" />
                <span className="text-muted-foreground text-label shrink-0 font-medium">
                  <Trans>For enabled notifications</Trans>
                </span>
                <div className="border-muted min-w-0 flex-1 border-t" />
              </div>

              <form.Subscribe
                selector={(state) =>
                  !state.values.notification_disabled &&
                  (state.values.notification_event ||
                    state.values.notification_detect)
                }
              >
                {(anyNotificationEnabled) => (
                  <form.Field name="respect_dnd">
                    {(field) => (
                      <SettingSwitchRow
                        title={<Trans>Respect Do-Not-Disturb mode</Trans>}
                        description={
                          <Trans>
                            Pause alerts while Do Not Disturb is on.
                          </Trans>
                        }
                        checked={field.state.value}
                        onChange={field.handleChange}
                        disabled={!anyNotificationEnabled}
                      />
                    )}
                  </form.Field>
                )}
              </form.Subscribe>
            </div>
          </>
        )}
      </form.Subscribe>
    </div>
  );
}
