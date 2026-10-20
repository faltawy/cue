import { Trans, useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  ArrowRight,
  DotsThree,
  Eye,
  FloppyDisk,
  Lightning,
  Play,
  Sparkle,
} from "@anlg/ui/components/icons";
import { Badge } from "@anlg/ui/components/ui/badge";
import { Button } from "@anlg/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@anlg/ui/components/ui/dropdown-menu";
import { toast } from "@anlg/ui/components/ui/toast";
import { cn } from "@anlg/utils";

import { MarkdownExportOptionsConfig } from "./markdown-export-options";
import { AutomationLastRunLine, MarkdownExportConfig } from "./starter-config";
import { useSaveWorkflow, WorkflowBuilder } from "./workflow-builder";

import {
  useDeleteWorkflow,
  useRemoveStarterDraft,
} from "~/automations/actions";
import { testStarterMarkdownExport } from "~/automations/engine";
import {
  DEFAULT_MARKDOWN_EXPORT_OPTIONS,
  hasMarkdownExportContent,
  parseStoredMarkdownExportOptions,
} from "~/automations/markdown-export";
import {
  useAutomationSelection,
  useEffectiveAutomationSelection,
} from "~/automations/selection";
import {
  STARTER_AUTOMATIONS,
  type StarterId,
  useStarterAutomations,
} from "~/automations/starters";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  isWorkflowReady,
  parseAutomationWorkflows,
  saveAutomationWorkflows,
  useAutomationWorkflows,
} from "~/automations/workflows";
import { SettingsHydrationBoundary } from "~/settings/hydration-boundary";
import { SettingsPageTitle } from "~/settings/page-title";
import {
  getStoredSettingValues,
  setSettingValue,
  setSettingValues,
  useStoredSettingValues,
} from "~/settings/queries";
import type { SettingValues } from "~/settings/schema";
import { StandardContentWrapper } from "~/shared/main";

export function TabContentAutomations() {
  return (
    <StandardContentWrapper>
      <SettingsHydrationBoundary>
        <div className="bg-card flex w-full flex-1 flex-col overflow-hidden">
          <AutomationsContent />
        </div>
      </SettingsHydrationBoundary>
    </StandardContentWrapper>
  );
}

export function AutomationsContent() {
  const selection = useEffectiveAutomationSelection();

  if (selection?.kind === "starter") {
    return (
      <StarterAutomationDetails
        key={selection.starterId}
        starterId={selection.starterId}
      />
    );
  }

  if (selection?.kind === "draft") {
    return <DraftAutomationDetails draftId={selection.draftId} />;
  }

  if (selection?.kind === "workflow") {
    return <PersistedWorkflowDetails workflowId={selection.workflowId} />;
  }

  return <AutomationsOverview />;
}

function AutomationsOverview() {
  return (
    <div className="scroll-fade-y scrollbar-hide h-full w-full flex-1 overflow-y-auto px-6 pt-6 pb-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <SettingsPageTitle title={<Trans>Automations</Trans>} />
          <p className="text-muted-foreground text-ui max-w-2xl">
            <Trans>
              Automate what happens before, during, or after meetings based on
              the conditions you choose.
            </Trans>
          </p>
        </div>

        <section className="border-border flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center">
          <Lightning className="text-muted-foreground size-4" />
          <h3 className="text-title mt-3">
            <Trans>No automation draft yet</Trans>
          </h3>
          <p className="text-muted-foreground text-ui mt-1 max-w-[340px] text-balance">
            <Trans>
              Choose a starter from the sidebar, or create a workflow and add
              steps like Zapier.
            </Trans>
          </p>
        </section>
      </div>
    </div>
  );
}

function DraftAutomationDetails({ draftId }: { draftId: string }) {
  const removeDraft = useAutomationSelection((state) => state.removeDraft);
  const workflow = useEnsuredWorkflow({ id: draftId });

  return (
    <CustomWorkflowDetails
      workflow={workflow}
      description={<Trans>Add a trigger and actions.</Trans>}
      onDelete={() => removeDraft(draftId)}
    />
  );
}

function AutomationDetailHeader({
  icon,
  title,
  actions,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 ps-3 pe-1">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center">
          {icon}
        </span>
        {typeof title === "string" ? (
          <h2 className="text-body min-w-0 truncate font-semibold">{title}</h2>
        ) : (
          title
        )}
      </div>
      {actions}
    </header>
  );
}

function AutomationDetailsLayout({
  icon,
  title,
  description,
  actions,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <AutomationDetailHeader icon={icon} title={title} actions={actions} />
      <div className="scroll-fade-y scrollbar-hide min-h-0 w-full flex-1 overflow-y-auto px-6 pt-3 pb-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          {description && (
            <p className="text-muted-foreground text-ui max-w-2xl">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function AutomationActionsMenu({
  actionLabel,
  onAction,
}: {
  actionLabel: React.ReactNode;
  onAction: () => void;
}) {
  const { t } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t`Automation actions`}
        >
          <DotsThree className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onAction} className="cursor-pointer">
          {actionLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersistedWorkflowDetails({ workflowId }: { workflowId: string }) {
  const deleteWorkflow = useDeleteWorkflow();
  const workflow = useEnsuredWorkflow({ id: workflowId });

  return (
    <CustomWorkflowDetails
      workflow={workflow}
      description={<Trans>Add a trigger and actions.</Trans>}
      onDelete={() => deleteWorkflow.mutate(workflowId)}
    />
  );
}

function CustomWorkflowDetails({
  workflow,
  description,
  onDelete,
}: {
  workflow: AutomationWorkflow;
  description: React.ReactNode;
  onDelete: () => void;
}) {
  const { t } = useLingui();
  const workflows = useAutomationWorkflows();
  const saveWorkflow = useSaveWorkflow();

  const persist = (next: AutomationWorkflow) => {
    saveWorkflow.mutate({ workflows, next });
  };

  const handleEnable = (enabled: boolean) => {
    persist({ ...workflow, enabled });
  };

  return (
    <AutomationDetailsLayout
      icon={<Lightning className="text-warm" size={16} />}
      title={
        <AutomationNameInput
          key={workflow.id}
          name={workflow.title}
          onRename={(title) => persist({ ...workflow, title })}
        />
      }
      description={description}
      actions={
        <div className="flex items-center gap-2">
          {workflow.enabled ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => handleEnable(false)}
              disabled={saveWorkflow.isPending}
            >
              <Trans>Disable</Trans>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => handleEnable(true)}
              disabled={saveWorkflow.isPending || !isWorkflowReady(workflow)}
              title={
                isWorkflowReady(workflow)
                  ? undefined
                  : t`Add and configure at least one action first.`
              }
            >
              <Lightning size={14} />
              <Trans>Save &amp; enable</Trans>
            </Button>
          )}
          <AutomationActionsMenu
            actionLabel={<Trans>Delete automation</Trans>}
            onAction={onDelete}
          />
        </div>
      }
    >
      <WorkflowBuilder workflow={workflow} onChange={persist} />
    </AutomationDetailsLayout>
  );
}

function AutomationNameInput({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(name);
  const [syncedName, setSyncedName] = useState(name);
  if (syncedName !== name) {
    setSyncedName(name);
    setDraft(name);
  }

  const commit = () => {
    const next = draft.trim();
    if (next === name.trim()) {
      setDraft(name);
      return;
    }
    onRename(next);
  };

  return (
    <input
      type="text"
      aria-label={t`Automation name`}
      placeholder={t`Untitled automation`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          setDraft(name);
          requestAnimationFrame(() => event.currentTarget?.blur());
        }
      }}
      className={cn([
        "text-body min-w-0 flex-1 truncate rounded-sm bg-transparent font-semibold",
        "placeholder:text-tertiary-foreground hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.04] -ms-1 px-1 outline-hidden",
      ])}
    />
  );
}

function useEnsuredWorkflow({ id }: { id: string }): AutomationWorkflow {
  const workflows = useAutomationWorkflows();
  const existing = workflows.find((workflow) => workflow.id === id);
  const fallback = useMemo(() => createEmptyWorkflow({ id }), [id]);

  useEffect(() => {
    if (existing) {
      return;
    }

    void (async () => {
      const stored = await getStoredSettingValues();
      const current = parseAutomationWorkflows(
        stored.values.automation_workflows,
      );
      if (current.some((workflow) => workflow.id === fallback.id)) {
        return;
      }
      await saveAutomationWorkflows([fallback, ...current]);
    })();
  }, [existing, fallback]);

  return existing ?? fallback;
}

function StarterAutomationDetails({ starterId }: { starterId: StarterId }) {
  const { t } = useLingui();
  const starter = useStarterAutomations().find((item) => item.id === starterId);
  const [showPreview, setShowPreview] = useState(false);
  const starterKeys = STARTER_AUTOMATIONS[starterId];
  const { values: settingValues } = useStoredSettingValues();
  const removeStarterDraft = useRemoveStarterDraft();

  const saveDraftMutation = useMutation({
    mutationKey: ["automation-draft-template"],
    mutationFn: () => setSettingValue("automation_draft_template", starterId),
    onSuccess: () => toast.success(t`Automation draft saved`),
    onError: () => toast.error(t`Could not save the automation draft`),
  });

  const saveOptionsMutation = useMutation({
    mutationKey: ["automation-markdown-export-options"],
    mutationFn: (options: typeof exportOptions) =>
      setSettingValue(
        "automation_markdown_export_options",
        JSON.stringify(options),
      ),
    onError: () => toast.error(t`Could not update the automation`),
  });

  const testMutation = useMutation({
    mutationKey: ["automation-starter-test"],
    mutationFn: testStarterMarkdownExport,
    onSuccess: (record) =>
      record.status === "success"
        ? toast.success(t`Test export saved to ${record.detail}`)
        : toast.error(t`Test export failed: ${record.detail}`),
    onError: (error) =>
      toast.error(
        error.message.includes("no notes")
          ? t`There are no notes to export yet.`
          : t`Could not run the test export`,
      ),
  });

  const setEnabledMutation = useMutation({
    mutationKey: ["automation-starter-enabled"],
    mutationFn: ({ enabled }: { enabled: boolean }) => {
      const updates: SettingValues = { automation_draft_template: starterId };
      updates[starterKeys.enabledKey] = enabled;
      return setSettingValues(updates);
    },
    onSuccess: (_, { enabled }) =>
      toast.success(enabled ? t`Automation enabled` : t`Automation disabled`),
    onError: () => toast.error(t`Could not update the automation`),
  });

  if (!starter) {
    return null;
  }

  const isEnabled = Boolean(settingValues[starterKeys.enabledKey]);
  const exportOptions =
    parseStoredMarkdownExportOptions(
      settingValues.automation_markdown_export_options,
    ) ?? DEFAULT_MARKDOWN_EXPORT_OPTIONS;
  const hasFolder =
    (settingValues[starterKeys.targetKey] ?? "").trim().length > 0;
  const isReady = hasFolder && hasMarkdownExportContent(exportOptions);
  const readinessHint = hasFolder
    ? t`Choose at least one section to export.`
    : t`Choose an export folder first.`;

  return (
    <AutomationDetailsLayout
      icon={starter.renderIcon(16)}
      title={starter.title}
      description={starter.description}
      actions={
        <AutomationActionsMenu
          actionLabel={<Trans>Remove automation</Trans>}
          onAction={() => removeStarterDraft.mutate(starterId)}
        />
      }
    >
      <section
        className="border-border bg-background overflow-hidden rounded-lg border"
        aria-labelledby="automation-draft-title"
      >
        <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Lightning className="text-muted-foreground size-4" />
              <h3 id="automation-draft-title" className="text-strong truncate">
                {starter.title}
              </h3>
              {isEnabled ? (
                <Badge>
                  <Trans>Enabled</Trans>
                </Badge>
              ) : (
                <Badge>
                  <Trans>Draft</Trans>
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-label mt-1">
              <Trans>Steps run from top to bottom.</Trans>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowPreview((visible) => !visible)}
            >
              <Eye size={14} />
              {showPreview ? (
                <Trans>Hide preview</Trans>
              ) : (
                <Trans>Preview</Trans>
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={!isReady || testMutation.isPending}
              title={
                isReady
                  ? t`Export your latest note now with these settings.`
                  : readinessHint
              }
            >
              <Play size={14} />
              <Trans>Test</Trans>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending}
            >
              <FloppyDisk size={14} />
              <Trans>Save draft</Trans>
            </Button>
            {isEnabled ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setEnabledMutation.mutate({ enabled: false })}
                disabled={setEnabledMutation.isPending}
              >
                <Trans>Disable</Trans>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => setEnabledMutation.mutate({ enabled: true })}
                disabled={setEnabledMutation.isPending || !isReady}
                title={isReady ? undefined : readinessHint}
              >
                <Lightning size={14} />
                <Trans>Save &amp; enable</Trans>
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-5">
          {starter.steps.map((step, index) => (
            <div key={`${step.kind}-${step.title}`}>
              <div className="border-border bg-background flex items-start gap-3 rounded-lg border p-3">
                <span
                  className={cn([
                    "text-label mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-semibold",
                    step.kind === "ai"
                      ? "bg-accent text-foreground"
                      : step.kind === "trigger"
                        ? "bg-warm/20 text-foreground"
                        : "bg-muted text-muted-foreground",
                  ])}
                >
                  {step.kind === "ai" ? <Sparkle size={13} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-ui font-medium">{step.title}</span>
                    <Badge>
                      {step.kind === "ai" ? (
                        <Trans>AI step</Trans>
                      ) : step.kind === "trigger" ? (
                        <Trans>Trigger</Trans>
                      ) : (
                        <Trans>Action</Trans>
                      )}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground text-label mt-1 block leading-relaxed">
                    {step.detail}
                  </span>
                </span>
              </div>
              {index < starter.steps.length - 1 ? (
                <div className="text-muted-foreground flex h-6 items-center ps-6">
                  <ArrowRight className="rotate-90" size={13} />
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="border-border border-t px-5 py-4">
          <MarkdownExportConfig />
          <MarkdownExportOptionsConfig
            options={exportOptions}
            onChange={(options) => saveOptionsMutation.mutate(options)}
          />
          <AutomationLastRunLine settingKey={starterKeys.lastRunKey} />
        </div>

        {showPreview ? (
          <div className="border-border bg-muted/35 border-t px-5 py-4">
            <div className="flex items-start gap-3">
              <Eye className="text-muted-foreground mt-0.5" size={15} />
              <div>
                <h4 className="text-label font-semibold">
                  <Trans>Expected output</Trans>
                </h4>
                <p className="text-muted-foreground text-label mt-1 leading-relaxed">
                  {starter.preview}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </AutomationDetailsLayout>
  );
}
