import {
  commands as localApiCommands,
  type MarkdownExportFile,
  type MarkdownExportOptions,
} from "@anlg/plugin-local-api";

import {
  hasMarkdownExportContent,
  parseStoredMarkdownExportOptions,
} from "./markdown-export";
import { type AutomationRunRecord, parseAutomationRunRecord } from "./types";
import {
  type AutomationWorkflow,
  parseAutomationWorkflows,
  mutateAutomationWorkflows,
  type WorkflowStep,
  type WorkflowTrigger,
} from "./workflows";

import { liveQueryClient } from "~/db";
import { getStoredSettingValues, setSettingValue } from "~/settings/queries";

export type { AutomationRunRecord };
export { parseAutomationRunRecord };

const MAX_PROCESSED_SESSIONS = 50;

export async function runMeetingCompletedAutomations(
  sessionId: string,
): Promise<void> {
  try {
    await runMarkdownExport(sessionId);
  } catch (error) {
    console.error("[automations] meeting.completed run failed", error);
  }
  try {
    await runCustomWorkflows(sessionId, "meeting_completed");
  } catch (error) {
    console.error("[automations] meeting.completed workflows failed", error);
  }
}

export async function runNoteEnhancedAutomations(
  sessionId: string,
): Promise<void> {
  try {
    await runCustomWorkflows(sessionId, "note_enhanced");
  } catch (error) {
    console.error("[automations] note.enhanced workflows failed", error);
  }
}

let workflowQueue: Promise<void> = Promise.resolve();
function enqueueWorkflowRun(run: () => Promise<void>): Promise<void> {
  const next = workflowQueue.then(run);
  workflowQueue = next.catch(() => {});
  return next;
}

function runCustomWorkflows(
  sessionId: string,
  trigger: WorkflowTrigger,
): Promise<void> {
  return enqueueWorkflowRun(() => runCustomWorkflowsNow(sessionId, trigger));
}

async function runCustomWorkflowsNow(
  sessionId: string,
  trigger: WorkflowTrigger,
): Promise<void> {
  const { values } = await getStoredSettingValues();
  const workflows = parseAutomationWorkflows(values.automation_workflows);
  for (const workflow of workflows) {
    if (!workflow.enabled || workflow.trigger !== trigger) {
      continue;
    }
    if (workflow.steps.length === 0) {
      continue;
    }
    if (trigger === "note_enhanced") {
      try {
        await runWorkflowWithFileExports(sessionId, workflow);
      } catch (error) {
        console.error("[automations] workflow run failed", error);
      }
      continue;
    }
    if (workflow.processedSessionIds.includes(sessionId)) {
      continue;
    }
    try {
      await runWorkflow(sessionId, workflow);
    } catch (error) {
      console.error("[automations] workflow run failed", error);
    }
  }
}

async function runWorkflow(
  sessionId: string,
  workflow: AutomationWorkflow,
): Promise<void> {
  const record: AutomationRunRecord = {
    at: new Date().toISOString(),
    status: "success",
    detail: "",
  };
  let markedSessionId: string | undefined;
  try {
    const details: string[] = [];
    for (const step of workflow.steps) {
      details.push(
        await executeWorkflowStep(
          sessionId,
          step,
          workflowStepKey(workflow, step, sessionId),
        ),
      );
      markedSessionId = sessionId;
      await persistWorkflowResult(workflow.id, { sessionId });
    }
    record.detail = details.filter(Boolean).join(" · ") || "ok";
    await persistWorkflowResult(workflow.id, {
      record,
      sessionId,
    });
  } catch (error) {
    record.status = "error";
    record.detail = error instanceof Error ? error.message : String(error);
    console.error("[automations] workflow failed", error);
    await persistWorkflowResult(workflow.id, {
      record,
      sessionId: markedSessionId,
    });
  }
}

async function persistWorkflowResult(
  workflowId: string,
  {
    record,
    sessionId,
  }: {
    record?: AutomationRunRecord;
    sessionId?: string;
  },
): Promise<void> {
  await mutateAutomationWorkflows((workflows) =>
    workflows.map((workflow) => {
      if (workflow.id !== workflowId) return workflow;
      return {
        ...workflow,
        lastRun: record ?? workflow.lastRun,
        processedSessionIds: sessionId
          ? appendProcessedSession(workflow.processedSessionIds, sessionId)
          : workflow.processedSessionIds,
      };
    }),
  );
}

function appendProcessedSession(
  processed: string[],
  sessionId: string,
): string[] {
  if (processed.includes(sessionId)) {
    return processed;
  }
  return [...processed, sessionId].slice(-MAX_PROCESSED_SESSIONS);
}

async function executeWorkflowStep(
  sessionId: string,
  step: WorkflowStep,
  stepKey: string,
): Promise<string> {
  const directory = step.directory.trim();
  if (!directory) {
    throw new Error("choose an export folder first");
  }
  if (step.options && !hasMarkdownExportContent(step.options)) {
    throw new Error("choose at least one element to export");
  }
  return await executeConfiguredMarkdownExport(
    sessionId,
    directory,
    step.options,
    stepKey,
  );
}

async function runMarkdownExport(sessionId: string): Promise<void> {
  const { values } = await getStoredSettingValues();
  if (!values.automation_markdown_export_enabled) {
    return;
  }
  const directory = (values.automation_markdown_export_directory ?? "").trim();
  if (!directory) {
    return;
  }
  await runStarterMarkdownExport(
    sessionId,
    directory,
    parseStoredMarkdownExportOptions(values.automation_markdown_export_options),
  );
}

async function runStarterMarkdownExport(
  sessionId: string,
  directory: string,
  options: MarkdownExportOptions | null,
): Promise<AutomationRunRecord> {
  const record: AutomationRunRecord = {
    at: new Date().toISOString(),
    status: "success",
    detail: "",
  };
  try {
    if (options && !hasMarkdownExportContent(options)) {
      throw new Error("choose at least one element to export");
    }
    record.detail = await executeMarkdownExport(
      sessionId,
      directory,
      options ?? undefined,
    );
  } catch (error) {
    record.status = "error";
    record.detail = error instanceof Error ? error.message : String(error);
    console.error("[automations] markdown export failed", error);
  }
  await setSettingValue(
    "automation_markdown_export_last_run",
    JSON.stringify(record),
  );
  return record;
}

// The most recent unlocked note, preferring ones with a transcript or summary,
// so a test run shows what a real meeting export looks like.
async function latestExportableSessionId(): Promise<string | null> {
  const rows = await liveQueryClient.execute<{ id: string }>(
    `
      SELECT sessions.id
      FROM sessions
      WHERE sessions.deleted_at IS NULL
        AND sessions.locked = 0
      ORDER BY
        CASE
          WHEN EXISTS (
            SELECT 1 FROM transcripts
            WHERE transcripts.session_id = sessions.id
              AND transcripts.deleted_at IS NULL
          ) OR EXISTS (
            SELECT 1 FROM session_documents
            WHERE session_documents.session_id = sessions.id
              AND session_documents.kind IN ('summary', 'template_output')
              AND session_documents.deleted_at IS NULL
          ) THEN 0
          ELSE 1
        END,
        sessions.created_at DESC
      LIMIT 1
    `,
  );
  return rows[0]?.id ?? null;
}

// Runs the Markdown export starter once, now, on the latest note, with the
// folder and options as currently configured (enabled or not).
export async function testStarterMarkdownExport(): Promise<AutomationRunRecord> {
  const { values } = await getStoredSettingValues();
  const directory = (values.automation_markdown_export_directory ?? "").trim();
  if (!directory) {
    throw new Error("choose an export folder first");
  }
  const sessionId = await latestExportableSessionId();
  if (!sessionId) {
    throw new Error("there are no notes to export yet");
  }
  return runStarterMarkdownExport(
    sessionId,
    directory,
    parseStoredMarkdownExportOptions(values.automation_markdown_export_options),
  );
}

async function executeMarkdownExport(
  sessionId: string,
  directory: string,
  options?: MarkdownExportOptions,
): Promise<string> {
  return (await exportMarkdownFile(sessionId, directory, options, null)).path;
}

async function exportMarkdownFile(
  sessionId: string,
  directory: string,
  options: MarkdownExportOptions | undefined,
  previous: MarkdownExportFile | null,
): Promise<MarkdownExportFile> {
  const result = await localApiCommands.exportMeetingMarkdown(
    sessionId,
    directory,
    options ?? null,
    previous,
  );
  if (result.status === "error") {
    throw new Error(result.error);
  }
  return result.data;
}

type StoredMarkdownExportFile = MarkdownExportFile & { key: string };

const MAX_MARKDOWN_EXPORT_FILES = 200;

function workflowStepKey(
  workflow: AutomationWorkflow,
  step: WorkflowStep,
  sessionId: string,
): string {
  return `${workflow.id}:${step.id}:${sessionId}`;
}

// A changed title renames the file, so the exporter replaces the one this step
// wrote last time unless another step now writes to that path.
async function executeConfiguredMarkdownExport(
  sessionId: string,
  directory: string,
  options: MarkdownExportOptions | undefined,
  key: string,
): Promise<string> {
  return await serializeSettingsUpdate(async () => {
    const { values } = await getStoredSettingValues();
    const files = parseMarkdownExportFiles(
      values.automation_markdown_export_files,
    );
    const others = files.filter((file) => file.key !== key);
    const previous = files.find((file) => file.key === key);
    const replaceable =
      previous &&
      !others.some(
        (file) => file.path.toLowerCase() === previous.path.toLowerCase(),
      )
        ? { path: previous.path, sha256: previous.sha256 }
        : null;
    const file = await exportMarkdownFile(
      sessionId,
      directory,
      options,
      replaceable,
    );
    await setSettingValue(
      "automation_markdown_export_files",
      JSON.stringify(
        [...others, { key, ...file }].slice(-MAX_MARKDOWN_EXPORT_FILES),
      ),
    );
    return file.path;
  });
}

let settingsUpdates: Promise<unknown> = Promise.resolve();

// Concurrent runs read and rewrite the same stored list, so run each
// read-modify-write after the previous one finishes.
function serializeSettingsUpdate<T>(update: () => Promise<T>): Promise<T> {
  const next = settingsUpdates.then(update, update);
  settingsUpdates = next.catch(() => undefined);
  return next;
}

function parseMarkdownExportFiles(
  value: string | undefined,
): StoredMarkdownExportFile[] {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (entry): entry is StoredMarkdownExportFile =>
            typeof entry === "object" &&
            entry !== null &&
            ["key", "path", "sha256"].every(
              (field) =>
                typeof (entry as Record<string, unknown>)[field] === "string",
            ),
        )
      : [];
  } catch {
    return [];
  }
}

// File exports overwrite the same file, so they rerun on every regenerated
// summary.
async function runWorkflowWithFileExports(
  sessionId: string,
  workflow: AutomationWorkflow,
): Promise<void> {
  const record: AutomationRunRecord = {
    at: new Date().toISOString(),
    status: "success",
    detail: "",
  };
  const details: string[] = [];
  for (const step of workflow.steps) {
    try {
      details.push(
        await executeWorkflowStep(
          sessionId,
          step,
          workflowStepKey(workflow, step, sessionId),
        ),
      );
      await persistWorkflowResult(workflow.id, { sessionId });
    } catch (error) {
      record.status = "error";
      details.push(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  record.detail = details.join(" · ");
  await persistWorkflowResult(workflow.id, { record });
}
