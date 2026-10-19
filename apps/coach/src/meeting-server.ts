import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Database } from "bun:sqlite";
import { z } from "zod";

import type { AppBridge, CoachEdit } from "./app-bridge";
import { readMeetingNote } from "./notes";
import { readLiveTranscript, readMeetingInfo, renderTranscript } from "./transcript";

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function failed(error: unknown) {
  return { ...text(error instanceof Error ? error.message : String(error)), isError: true };
}

export type MeetingEdits = {
  bridge: AppBridge;
  onEdit(edit: CoachEdit): void;
  onUndo(edit: CoachEdit): void;
};

export function meetingServer(db: Database, sessionId: () => string | undefined, edits?: MeetingEdits) {
  const current = () => {
    const id = sessionId();
    if (!id) throw new Error("No meeting is attached to the coach.");
    return id;
  };

  const editTools = edits
    ? [
        tool(
          "update_note",
          "Add lines to the end of this meeting's notes in the app, as paragraphs or as a bullet list. Use only when the user asks you to write something into the notes. The user sees the edit marked as by coach, with Undo.",
          {
            lines: z.array(z.string().min(1)).min(1),
            style: z.enum(["paragraphs", "bullets"]).default("bullets"),
          },
          async ({ lines, style }) => {
            try {
              const edit = await edits.bridge.appendNote(current(), lines, style);
              edits.onEdit(edit);
              return text(`${edit.summary} (edit ${edit.id})`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "add_action_item",
          "Add an action item (a checkbox task) to this meeting's notes in the app. Use only when the user asks. Put the owner first when it is not the user, e.g. \"Sara: send the pricing sheet (Friday)\".",
          { text: z.string().min(1) },
          async ({ text: task }) => {
            try {
              const edit = await edits.bridge.addActionItem(current(), task);
              edits.onEdit(edit);
              return text(`${edit.summary} (task_id ${edit.task_id})`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "complete_action_item",
          "Mark one of this meeting's action items done. Take the task_id from mcp__meeting__meeting_notes. Use only when the user asks.",
          { task_id: z.string().min(1) },
          async ({ task_id }) => {
            try {
              const edit = await edits.bridge.completeActionItem(current(), task_id);
              edits.onEdit(edit);
              return text(edit.summary);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "undo_last_coach_edit",
          "Undo the coach's most recent change to this meeting's notes or action items.",
          {},
          async () => {
            try {
              const edit = await edits.bridge.undo(current());
              edits.onUndo(edit);
              return text(`Undid: ${edit.summary}`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
      ]
    : [];

  return createSdkMcpServer({
    name: "meeting",
    version: "0.2.0",
    instructions:
      "Tools for the meeting the coach is attached to. Call live_transcript before answering anything about what was said.",
    tools: [
      tool(
        "live_transcript",
        "The meeting's transcript so far, as timestamped lines labelled by speaker: You (the user), a participant name when known, or Speaker N for an unnamed voice. Pass since_ms to get only speech after that offset.",
        { since_ms: z.number().int().nonnegative().optional() },
        async ({ since_ms }) => {
          const transcript = readLiveTranscript(db, { sessionId: sessionId(), sinceMs: since_ms });
          return text(transcript ? renderTranscript(transcript) : "No meeting transcript found.");
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "meeting_info",
        "Title, start/end time and participants of the current meeting.",
        {},
        async () => {
          const id = sessionId();
          const info = id ? readMeetingInfo(db, id) : null;
          return text(info ? JSON.stringify(info, null, 2) : "No meeting found.");
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "meeting_notes",
        "The user's notes for this meeting as they are in the app right now, including action items as checkboxes with their task_id.",
        {},
        async () => {
          const id = sessionId();
          return text(id ? readMeetingNote(db, id) : "No meeting found.");
        },
        { annotations: { readOnlyHint: true } },
      ),
      ...editTools,
    ],
  });
}
