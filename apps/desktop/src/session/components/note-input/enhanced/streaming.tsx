import { Trans } from "@lingui/react/macro";
import { Streamdown } from "streamdown";

import { streamdownIcons } from "@anlg/ui/components/streamdown-icons";
import { Button } from "@anlg/ui/components/ui/button";
import { cn } from "@anlg/utils";

import { streamdownComponents } from "../../streamdown";

import { ClaudeSetupLabel } from "~/ai/claude-setup-label";
import { useAITaskTask, useClaudeSetup } from "~/ai/hooks";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";
import { getPersistableGeneratedTitle } from "~/store/zustand/ai-task/task-configs/title-success";

function SummaryTitleSpace({ title }: { title: string }) {
  return (
    <div
      data-testid="summary-title-space"
      className="pointer-events-none mb-4 flex min-h-[1.875rem] items-start"
    >
      {title ? (
        <h1 className="text-foreground text-[1.5rem] leading-[1.875rem] font-semibold">
          {title}
        </h1>
      ) : (
        <span
          aria-hidden="true"
          className="text-muted-foreground animate-pulse text-[1.5rem] leading-[1.875rem] font-semibold opacity-60"
        >
          <Trans>Generating title...</Trans>
        </span>
      )}
    </div>
  );
}

export function StreamingView({
  sessionId,
  sessionTitle,
  enhancedNoteId,
}: {
  sessionId: string;
  sessionTitle: string;
  enhancedNoteId: string;
}) {
  const taskId = createTaskId(enhancedNoteId, "enhance");
  const { streamedText, isGenerating, currentStep } = useAITaskTask(
    taskId,
    "enhance",
  );
  const isReasoning = currentStep?.type === "reasoning";
  const titleTaskId = createTaskId(sessionId, "title");
  const { streamedText: streamedTitle, isGenerating: isGeneratingTitle } =
    useAITaskTask(titleTaskId, "title");
  const title = sessionTitle.trim();
  const generatedTitle = isGeneratingTitle
    ? ""
    : getPersistableGeneratedTitle(streamedTitle);
  const claudeSetup = useClaudeSetup();
  const visibleTitle = title || generatedTitle;

  if (streamedText.trim().length === 0) {
    if (claudeSetup.setup && !claudeSetup.ready) {
      const failed = claudeSetup.setup.state === "failed";
      return (
        <div
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className="text-muted-foreground text-body flex flex-col items-start gap-2 pb-2"
        >
          <p
            className={
              failed ? "text-destructive leading-5" : "coach-sheen leading-5"
            }
          >
            <ClaudeSetupLabel setup={claudeSetup.setup} />
          </p>
          {failed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={claudeSetup.retrying}
              onClick={claudeSetup.retry}
            >
              <Trans>Retry</Trans>
            </Button>
          )}
        </div>
      );
    }
    return (
      <div
        role="status"
        aria-live="polite"
        className="text-muted-foreground text-body flex flex-col gap-0.5 pb-2"
      >
        <p className="coach-sheen leading-5">
          {isReasoning ? (
            <Trans>Model is thinking...</Trans>
          ) : (
            <Trans>Analyzing structure...</Trans>
          )}
        </p>
        <p className="text-label flex items-start gap-1.5 ps-4 leading-5">
          <span
            aria-hidden="true"
            className="border-muted-foreground/60 mt-[5px] h-2 w-2 shrink-0 rounded-es-sm border-s border-b"
          />
          <span>
            {isReasoning ? (
              <Trans>
                Reasoning models think through the transcript before writing.
              </Trans>
            ) : (
              <Trans>Tip: The Cue team loves our users!</Trans>
            )}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="pb-2">
      <div className="flex flex-col gap-1">
        <SummaryTitleSpace title={visibleTitle} />
        <Streamdown
          icons={streamdownIcons}
          components={streamdownComponents}
          className={cn(["note-typography", "flex flex-col"])}
          caret="block"
          isAnimating={isGenerating}
        >
          {streamedText}
        </Streamdown>
      </div>
    </div>
  );
}
