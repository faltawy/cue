import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import type { Database } from "bun:sqlite";
import { z } from "zod";

import type { AppBridge, CoachEdit } from "./app-bridge";
import { type Block, showInputShape } from "./blocks";
import { MOVE_TAGS } from "./move";
import { libraryTools } from "./library-tools";
import { readMeetingNote } from "./notes";
import { failed, text } from "./tool-result";
import { readLiveTranscript, readMeetingInfo, renderTranscript } from "./transcript";

export type MeetingEdits = {
  bridge: AppBridge;
  onEdit(edit: CoachEdit): void;
  onUndo(edit: CoachEdit): void;
};

const SHOWN: Record<Block["kind"], string> = {
  actions: "The user sees the checklist under your answer; don't repeat it.",
  replies: "The user sees these as tappable follow-ups under your answer.",
  move: "The user sees the move under your answer, with the line ready to copy; don't repeat it.",
};

export function showTool(onShow: (block: Block) => void) {
  return tool(
    "show",
    `Show a rich block under your answer. kind "actions": a checklist of commitments or next steps, each with text and optional owner and due; the user can tick items or add them to the meeting notes. Use it only when the user asks for one or your answer lists commitments. kind "replies": 2 or 3 short follow-up asks, worded as the user would type them, shown as tappable chips. Use it only when a follow-up is genuinely likely. kind "move": the one move to make next. tag: the moment (${MOVE_TAGS.join(", ")}); headline: the move in under 10 words, in English; verb "Say" or "Ask"; line: one or two sentences the user can say word for word, in the meeting's language, without quotation marks; watch_out: optional, under 12 words, what to avoid or one fact they need; moment: optional, the line that prompted it, as speaker, a short quote and at (mm:ss from the transcript, no brackets). At most one of each per answer.`,
    showInputShape,
    async (input) => {
      const parsed = z.object(showInputShape).safeParse(input);
      if (!parsed.success) return failed(new Error(`Invalid block: ${z.prettifyError(parsed.error)}`));
      onShow(parsed.data.block);
      return text(SHOWN[parsed.data.block.kind]);
    },
    { annotations: { readOnlyHint: true } },
  );
}

export function meetingServer(
  db: Database,
  sessionId: () => string | undefined,
  edits?: MeetingEdits,
  onShow?: (block: Block) => void,
) {
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
          "Undo the coach's most recent change: to this meeting's notes or action items, or to the user's notes library (a created note, folder, contact, organization or template, a rename, move or tag change, an added participant). A note, contact or folder the coach created is removed only while nobody changed it since; otherwise undo refuses and says why.",
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
      ...libraryTools(db, current, edits),
      ...(onShow ? [showTool(onShow)] : []),
    ],
  });
}
