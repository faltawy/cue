import { useMemo } from "react";

import { defaultSummaryDocumentId } from "@anlg/utils/session";

import { useAITask } from "~/ai/contexts";
import { useEnhancedNoteRecords } from "~/session/queries";
import { TaskType, TaskStatus } from "~/store/zustand/ai-task/enums";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";

export function useEnhancedNotes(sessionId: string, hasTranscript = false) {
  const notes = useEnhancedNoteRecords(sessionId);
  return useMemo(
    () =>
      notes.length === 0 && hasTranscript
        ? [defaultSummaryDocumentId(sessionId)]
        : notes.map((note) => note.id),
    [notes, sessionId, hasTranscript],
  );
}

export function useIsSessionEnhancing(sessionId: string): boolean {
  const enhancedNoteIds = useEnhancedNotes(sessionId);

  const taskIds = useMemo(
    () => enhancedNoteIds.map((id) => createTaskId(id, TaskType.Enhance)),
    [enhancedNoteIds],
  );

  const isEnhancing = useAITask((state) => {
    return taskIds.some(
      (taskId) => state.tasks[taskId]?.status === TaskStatus.Generating,
    );
  });

  return isEnhancing;
}
