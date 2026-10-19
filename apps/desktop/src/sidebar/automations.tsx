import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

import { Lightning, MagnifyingGlass, Plus, X } from "@anlg/ui/components/icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

import { CustomSidebarHeader } from "./custom-sidebar-header";

import {
  useDeleteWorkflow,
  useRemoveStarterDraft,
} from "~/automations/actions";
import {
  useAutomationSelection,
  useEffectiveAutomationSelection,
} from "~/automations/selection";
import {
  type StarterAutomation,
  useStarterAutomations,
} from "~/automations/starters";
import {
  type AutomationWorkflow,
  createEmptyWorkflow,
  saveAutomationWorkflows,
  useAutomationWorkflows,
} from "~/automations/workflows";
import { useNativeContextMenu } from "~/shared/hooks/useNativeContextMenu";
import { EmptyState } from "~/shared/ui/empty-state";

export function AutomationsNav() {
  const { t } = useLingui();
  const [search, setSearch] = useState("");
  const starters = useStarterAutomations();
  const workflows = useAutomationWorkflows();
  const selection = useEffectiveAutomationSelection();
  const draftIds = useAutomationSelection((state) => state.draftIds);
  const selectStarter = useAutomationSelection((state) => state.selectStarter);
  const selectWorkflow = useAutomationSelection(
    (state) => state.selectWorkflow,
  );

  const query = search.trim().toLowerCase();
  const draftTitle = t`Untitled automation`;
  const filteredStarters = query
    ? starters.filter(
        (starter) =>
          starter.title.toLowerCase().includes(query) ||
          starter.description.toLowerCase().includes(query),
      )
    : starters;
  const filteredDraftIds =
    query && !draftTitle.toLowerCase().includes(query) ? [] : draftIds;
  const filteredWorkflows = useMemo(() => {
    return workflows.filter(
      (workflow) => !query || workflow.title.toLowerCase().includes(query),
    );
  }, [query, workflows]);
  const isEmpty =
    filteredStarters.length === 0 &&
    filteredDraftIds.length === 0 &&
    filteredWorkflows.length === 0;

  const createAutomation = () => {
    const workflow = createEmptyWorkflow();
    void saveAutomationWorkflows([workflow, ...workflows]).then(() => {
      selectWorkflow(workflow.id);
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden pb-2">
      <CustomSidebarHeader>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:text-foreground relative z-[60]"
          aria-label={t`New automation`}
          onClick={createAutomation}
        >
          <Plus size={16} />
        </Button>
      </CustomSidebarHeader>

      <div className="pb-2">
        <div
          className={cn([
            "border-border bg-accent/50 flex h-8 w-full shrink-0 items-center gap-2 rounded-lg border px-3",
            "focus-within:bg-accent transition-colors",
          ])}
        >
          <MagnifyingGlass className="text-muted-foreground h-4 w-4 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setSearch("");
              }
            }}
            placeholder={t`Search automations...`}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm placeholder:text-sm focus:outline-hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className={cn([
                "size-4 shrink-0",
                "text-muted-foreground hover:text-foreground",
                "transition-colors",
              ])}
              aria-label={t`Clear search`}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto pt-1">
        {isEmpty ? (
          search ? (
            <EmptyState
              size="list"
              title={<Trans>No automations match “{search.trim()}”</Trans>}
              action={{
                label: <Trans>Clear search</Trans>,
                onClick: () => setSearch(""),
              }}
            />
          ) : (
            <EmptyState
              size="list"
              title={<Trans>No automations yet</Trans>}
              description={
                <Trans>Run steps automatically when a meeting ends.</Trans>
              }
              action={{
                label: <Trans>New automation</Trans>,
                onClick: createAutomation,
              }}
            />
          )
        ) : (
          <>
            {filteredStarters.length > 0 ? (
              <div className="pb-2">
                <h3 className="text-muted-foreground px-3 pt-1 pb-1 text-xs font-medium">
                  <Trans>Get started</Trans>
                </h3>
                {filteredStarters.map((starter) => (
                  <StarterListItem
                    key={starter.id}
                    starter={starter}
                    selected={
                      selection?.kind === "starter" &&
                      selection.starterId === starter.id
                    }
                    onSelect={selectStarter}
                  />
                ))}
              </div>
            ) : null}

            {filteredDraftIds.length > 0 || filteredWorkflows.length > 0 ? (
              <div>
                <h3 className="text-muted-foreground px-3 pt-1 pb-1 text-xs font-medium">
                  <Trans>My automations</Trans>
                </h3>
                {filteredDraftIds.map((draftId) => (
                  <DraftListItem
                    key={draftId}
                    draftId={draftId}
                    title={draftTitle}
                    selected={
                      selection?.kind === "draft" &&
                      selection.draftId === draftId
                    }
                  />
                ))}
                {filteredWorkflows.map((workflow) => (
                  <WorkflowListItem
                    key={workflow.id}
                    workflow={workflow}
                    selected={
                      selection?.kind === "workflow" &&
                      selection.workflowId === workflow.id
                    }
                    onSelect={selectWorkflow}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function StarterListItem({
  starter,
  selected,
  onSelect,
}: {
  starter: StarterAutomation;
  selected: boolean;
  onSelect: (starterId: StarterAutomation["id"]) => void;
}) {
  const { t } = useLingui();
  const removeStarterDraft = useRemoveStarterDraft();
  const contextMenu = useMemo(
    () => [
      {
        id: `edit-automation-${starter.id}`,
        text: t`Edit`,
        action: () => onSelect(starter.id),
      },
      { separator: true as const },
      {
        id: `remove-automation-${starter.id}`,
        text: t`Remove`,
        action: () => removeStarterDraft.mutate(starter.id),
      },
    ],
    [onSelect, removeStarterDraft, starter.id, t],
  );
  const showContextMenu = useNativeContextMenu(contextMenu);

  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(starter.id)}
      onContextMenu={(event) => {
        onSelect(starter.id);
        void showContextMenu(event);
      }}
      className={cn([
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors select-none",
        selected ? "bg-accent" : "hover:bg-accent/50",
      ])}
    >
      <span className="flex items-center gap-2">
        <span className="flex size-4 shrink-0 items-center justify-center">
          {starter.renderIcon(16)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {starter.title}
        </span>
      </span>
    </button>
  );
}

function DraftListItem({
  draftId,
  title,
  selected,
}: {
  draftId: string;
  title: string;
  selected: boolean;
}) {
  const { t } = useLingui();
  const selectDraft = useAutomationSelection((state) => state.selectDraft);
  const removeDraft = useAutomationSelection((state) => state.removeDraft);
  const contextMenu = useMemo(
    () => [
      {
        id: `edit-automation-${draftId}`,
        text: t`Edit`,
        action: () => selectDraft(draftId),
      },
      { separator: true as const },
      {
        id: `delete-automation-${draftId}`,
        text: t`Delete`,
        action: () => removeDraft(draftId),
      },
    ],
    [draftId, removeDraft, selectDraft, t],
  );
  const showContextMenu = useNativeContextMenu(contextMenu);

  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => selectDraft(draftId)}
      onContextMenu={(event) => {
        selectDraft(draftId);
        void showContextMenu(event);
      }}
      className={cn([
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors select-none",
        selected ? "bg-accent" : "hover:bg-accent/50",
      ])}
    >
      <span className="flex items-center gap-2">
        <Lightning className="text-warm size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            <Trans>Draft</Trans>
          </span>
        </span>
      </span>
    </button>
  );
}

function WorkflowListItem({
  workflow,
  selected,
  onSelect,
}: {
  workflow: AutomationWorkflow;
  selected: boolean;
  onSelect: (workflowId: string) => void;
}) {
  const { t } = useLingui();
  const deleteWorkflow = useDeleteWorkflow();
  const contextMenu = useMemo(
    () => [
      {
        id: `edit-automation-${workflow.id}`,
        text: t`Edit`,
        action: () => onSelect(workflow.id),
      },
      { separator: true as const },
      {
        id: `delete-automation-${workflow.id}`,
        text: t`Delete`,
        action: () => deleteWorkflow.mutate(workflow.id),
      },
    ],
    [deleteWorkflow, onSelect, t, workflow.id],
  );
  const showContextMenu = useNativeContextMenu(contextMenu);

  return (
    <button
      type="button"
      aria-current={selected ? "page" : undefined}
      onClick={() => onSelect(workflow.id)}
      onContextMenu={(event) => {
        onSelect(workflow.id);
        void showContextMenu(event);
      }}
      className={cn([
        "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors select-none",
        selected ? "bg-accent" : "hover:bg-accent/50",
      ])}
    >
      <span className="flex items-center gap-2">
        <Lightning className="text-warm size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {workflow.title.trim() || t`Untitled automation`}
          </span>
          <span className="text-muted-foreground mt-0.5 block truncate text-xs">
            {workflow.enabled ? <Trans>Enabled</Trans> : <Trans>Draft</Trans>}
          </span>
        </span>
      </span>
    </button>
  );
}
