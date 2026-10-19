import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type ClaudeModel,
  type CoachSettings,
  commands as coachCommands,
} from "@anlg/plugin-coach";
import { Button } from "@anlg/ui/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@anlg/ui/components/ui/select";

import { ClaudeConnectorsGroup } from "./connectors";
import { CoachInstructionsSection } from "./instructions";
import { SpendLimitInput } from "./spend-limit";
import { CoachToolsSection } from "./tools";

import { COACH_SETTINGS_QUERY_KEY, useCoachSettings } from "~/ai/hooks";
import { SettingsPageTitle } from "~/settings/page-title";
import {
  SETTING_CONTROL_CLASS,
  SettingRow,
  SettingSwitchRow,
} from "~/settings/setting-row";
import { FolderPathLabel } from "~/shared/ui/folder-path-label";

async function saveSettings(next: CoachSettings) {
  const result = await coachCommands.setSettings(next);
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return next;
}

async function addKnowledge(folder: boolean) {
  const result = await coachCommands.addKnowledge(folder);
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

async function chooseProject() {
  const result = await coachCommands.chooseProject();
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

export function SettingsClaude() {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const settingsQuery = useCoachSettings();
  const save = useMutation({
    mutationFn: saveSettings,
    onSuccess: (next) =>
      queryClient.setQueryData(COACH_SETTINGS_QUERY_KEY, next),
  });
  const saveTools = useMutation({
    mutationFn: saveSettings,
    onSuccess: (next) =>
      queryClient.setQueryData(COACH_SETTINGS_QUERY_KEY, next),
  });
  const pickProject = useMutation({
    mutationFn: chooseProject,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: COACH_SETTINGS_QUERY_KEY }),
  });

  const pickKnowledge = useMutation({
    mutationFn: addKnowledge,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: COACH_SETTINGS_QUERY_KEY }),
  });

  const settings = settingsQuery.data;
  const error =
    settingsQuery.error ??
    save.error ??
    pickProject.error ??
    pickKnowledge.error;
  const modelLabels: Record<ClaudeModel, string> = {
    sonnet: t`Sonnet`,
    opus: t`Opus`,
    haiku: t`Haiku`,
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SettingsPageTitle title={t`Claude`} />
        <p className="text-muted-foreground text-body">
          <Trans>
            Summaries, titles, briefs and the coach run on Claude, using the
            Claude sign-in on this Mac. No API keys needed.
          </Trans>
        </p>
      </div>

      {settings && (
        <section className="flex flex-col gap-4">
          <SettingRow
            title={<Trans>Model</Trans>}
            description={
              <Trans>Sonnet is the default. Opus is slower and smarter.</Trans>
            }
          >
            {(labelProps) => (
              <Select
                value={settings.model}
                disabled={save.isPending}
                onValueChange={(model) =>
                  save.mutate({
                    ...settings,
                    model:
                      model === "opus" || model === "haiku" ? model : "sonnet",
                  })
                }
              >
                <SelectTrigger
                  {...labelProps}
                  className={SETTING_CONTROL_CLASS}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["sonnet", "opus", "haiku"] as const).map((model) => (
                    <SelectItem key={model} value={model}>
                      {modelLabels[model]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </SettingRow>

          <SettingRow
            title={<Trans>Coach project</Trans>}
            description={
              settings.project ? (
                <FolderPathLabel path={settings.project} />
              ) : (
                <Trans>Choose the folder the coach can read.</Trans>
              )
            }
            controlWidth="content"
          >
            {(labelProps) => (
              <Button
                {...labelProps}
                type="button"
                variant="outline"
                size="sm"
                disabled={pickProject.isPending}
                onClick={() => pickProject.mutate()}
              >
                {settings.project ? (
                  <Trans>Change…</Trans>
                ) : (
                  <Trans>Choose…</Trans>
                )}
              </Button>
            )}
          </SettingRow>

          <SettingSwitchRow
            title={<Trans>Nudges</Trans>}
            description={
              <Trans>
                While recording, the coach speaks up on its own when a question,
                promise or number may need you.
              </Trans>
            }
            checked={settings.nudges}
            disabled={save.isPending}
            onChange={(nudges) => save.mutate({ ...settings, nudges })}
          />

          <SettingRow
            title={<Trans>Spend limit per meeting</Trans>}
            description={
              <Trans>
                Nudges pause once they reach this estimated amount in a meeting.
                Asking the coach always works.
              </Trans>
            }
          >
            {(labelProps) => (
              <SpendLimitInput
                cents={settings.nudge_limit_cents}
                disabled={save.isPending || !settings.nudges}
                labelProps={labelProps}
                onSave={(nudge_limit_cents) =>
                  save.mutate({ ...settings, nudge_limit_cents })
                }
              />
            )}
          </SettingRow>

          <SettingSwitchRow
            title={<Trans>Web access</Trans>}
            description={
              <Trans>
                The coach can search the web and read public pages when you ask
                about something mentioned in a meeting.
              </Trans>
            }
            checked={settings.web_access}
            disabled={save.isPending}
            onChange={(web_access) => save.mutate({ ...settings, web_access })}
          />
        </section>
      )}

      {settings && (
        <CoachInstructionsSection
          instructions={settings.instructions}
          knowledge={settings.knowledge}
          busy={save.isPending || pickKnowledge.isPending}
          onSaveInstructions={(instructions) =>
            save.mutate({ ...settings, instructions })
          }
          onRemoveKnowledge={(path) =>
            save.mutate({
              ...settings,
              knowledge: settings.knowledge.filter((entry) => entry !== path),
            })
          }
          onAddKnowledge={(folder) => pickKnowledge.mutate(folder)}
        />
      )}

      {settings && (
        <CoachToolsSection
          servers={settings.mcp_servers}
          disabled={save.isPending}
          onChange={(mcp_servers) =>
            saveTools.mutateAsync({ ...settings, mcp_servers })
          }
        />
      )}

      {settings && (
        <ClaudeConnectorsGroup
          connectors={settings.claude_connectors}
          disabled={save.isPending || saveTools.isPending}
          onChange={(claude_connectors) =>
            saveTools.mutateAsync({ ...settings, claude_connectors })
          }
        />
      )}

      {error && (
        <p role="alert" className="text-destructive text-body">
          {error.message}
        </p>
      )}
    </div>
  );
}
