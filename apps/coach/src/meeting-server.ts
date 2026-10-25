import {
  createSdkMcpServer,
  tool as sdkTool,
} from "@anthropic-ai/claude-agent-sdk";
import { type Database } from "bun:sqlite";
import { z } from "zod";

import { type AppBridge, type CoachEdit, NoteStyle } from "./app-bridge";
import { type Block, showInputShape } from "./blocks";
import { libraryTools } from "./library-tools";
import { MOVE_TAGS } from "./move";
import { readMeetingNote } from "./notes";
import { tool } from "./runtime-tool";
import { failed, text } from "./tool-result";
import {
  ParticipantResolutionStatus,
  readLiveTranscript,
  readMeetingInfo,
  readTranscriptEditContext,
  renderTranscript,
  resolveMeetingParticipant,
  TranscriptEditStatus,
} from "./transcript";

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
    `Show a rich block under your answer. kind "actions": a checklist of commitments or next steps, each with text and optional owner and due; the user can tick items or add them to the meeting notes. Use it only when the user asks for one or your answer lists commitments. kind "replies": 2 or 3 short follow-up asks, worded as the user would type them, shown as tappable chips. Use it only when a follow-up is genuinely likely. kind "move": the one move to make next. tag: the moment (${MOVE_TAGS.join(", ")}); headline: the move in under 10 words, in English; verb "Say" or "Ask"; line: one or two sentences the user can say word for word, in the meeting's main language, without quotation marks; watch_out: optional, under 12 words, in the meeting's main language, what to avoid or one fact they need; moment: optional, the line that prompted it, as speaker, a short quote and at (mm:ss from the transcript, no brackets). At most one of each per answer.`,
    showInputShape,
    async (input) => {
      const parsed = z.object(showInputShape).safeParse(input);
      if (!parsed.success)
        return failed(
          new Error(`Invalid block: ${z.prettifyError(parsed.error)}`),
        );
      onShow(parsed.data.block);
      return text(SHOWN[parsed.data.block.kind]);
    },
    { annotations: { readOnlyHint: true } },
  );
}

export function meetingTools(
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
          "assign_speaker",
          "Assign a diarized speaker to a uniquely named person who is already a participant in this meeting. Use only when the user explicitly asks. Read transcript_edit_context first; use its exact channel and speaker_index. Ask the user if the person or speaker is ambiguous. Never create a person or infer an identity.",
          {
            channel: z.number().int().nonnegative(),
            speaker_index: z.number().int().nonnegative(),
            person_name: z.string().trim().min(1),
          },
          async ({ channel, speaker_index, person_name }) => {
            const session = current();
            const context = readTranscriptEditContext(db, session);
            const speakerExists =
              context.status === TranscriptEditStatus.Live
                ? context.speakers.some(
                    (speaker) =>
                      speaker.channel === channel &&
                      speaker.speaker_index === speaker_index,
                  )
                : context.status === TranscriptEditStatus.Ready &&
                  context.lines.some(
                    (line) =>
                      line.channel === channel &&
                      line.speaker_index === speaker_index,
                  );
            if (!speakerExists)
              return failed(
                new Error(
                  "That diarized speaker is not in this meeting's current transcript. Ask which speaker the user means instead of guessing.",
                ),
              );
            const participant = resolveMeetingParticipant(
              db,
              session,
              person_name,
            );
            if (participant.status === ParticipantResolutionStatus.Ambiguous)
              return failed(
                new Error(
                  `More than one meeting participant is named ${person_name}. Ask the user which person they mean.`,
                ),
              );
            if (participant.status === ParticipantResolutionStatus.NotFound)
              return failed(
                new Error(
                  `${person_name} is not a current participant in this meeting. Do not create or use another contact.`,
                ),
              );
            try {
              const edit = await edits.bridge.assignTranscriptSpeaker(session, {
                channel,
                speaker_index,
                human_id: participant.humanId,
              });
              edits.onEdit(edit);
              return text(`${edit.summary} (edit ${edit.id})`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "correct_transcript",
          "Correct a clearly identified misheard span only after this meeting has ended and only when the user explicitly asks. Take exact word_ids and expected_text from transcript_edit_context; ask if the span or replacement is ambiguous. Preserve the original timing. The user can undo this edit.",
          {
            word_ids: z.array(z.string().min(1)).min(1),
            expected_text: z.string().min(1),
            replacement: z.string().trim().min(1),
          },
          async ({ word_ids, expected_text, replacement }) => {
            const session = current();
            const context = readTranscriptEditContext(db, session);
            if (context.status === TranscriptEditStatus.Live)
              return failed(
                new Error(
                  "Transcript corrections are available after the meeting ends. Speaker names can still be assigned during the call.",
                ),
              );
            if (context.status !== TranscriptEditStatus.Ready)
              return failed(
                new Error("No finalized transcript is available to correct."),
              );
            const available = new Set(
              context.lines.flatMap((line) => line.word_ids),
            );
            if (word_ids.some((id) => !available.has(id)))
              return failed(
                new Error(
                  "Those word IDs are not in the finalized transcript. Read transcript_edit_context again and use its current IDs.",
                ),
              );
            try {
              const edit = await edits.bridge.correctTranscript(session, {
                word_ids,
                expected_text,
                replacement,
              });
              edits.onEdit(edit);
              return text(`${edit.summary} (edit ${edit.id})`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "update_note",
          "Add lines to the end of this meeting's notes in the app, as paragraphs or as a bullet list. Use only when the user asks you to write something into the notes. The user sees the edit marked as by coach, with Undo.",
          {
            lines: z.array(z.string().min(1)).min(1),
            style: z.enum(NoteStyle).default(NoteStyle.Bullets),
          },
          async ({ lines, style }) => {
            try {
              const edit = await edits.bridge.appendNote(
                current(),
                lines,
                style,
              );
              edits.onEdit(edit);
              return text(`${edit.summary} (edit ${edit.id})`);
            } catch (error) {
              return failed(error);
            }
          },
        ),
        tool(
          "add_action_item",
          'Add an action item (a checkbox task) to this meeting\'s notes in the app. Use only when the user asks. Put the owner first when it is not the user, e.g. "Sara: send the pricing sheet (Friday)".',
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
              const edit = await edits.bridge.completeActionItem(
                current(),
                task_id,
              );
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

  return [
    tool(
      "live_transcript",
      "The meeting's transcript so far, as timestamped lines labelled by speaker: You (the user), a participant name when known, or Speaker N for an unnamed voice. Pass since_ms to get only speech after that offset.",
      { since_ms: z.number().int().nonnegative().optional() },
      async ({ since_ms }) => {
        const transcript = readLiveTranscript(db, {
          sessionId: sessionId(),
          sinceMs: since_ms,
        });
        return text(
          transcript
            ? renderTranscript(transcript)
            : "No meeting transcript found.",
        );
      },
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      "transcript_edit_context",
      "Read finalized transcript lines with stable word_ids and speaker coordinates. This is only for a specific speaker assignment or wording correction the user explicitly asked for; live transcripts cannot be edited.",
      {},
      async () => {
        const context = readTranscriptEditContext(db, current());
        return text(JSON.stringify(context, null, 2));
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
  ];
}

export function meetingServer(...args: Parameters<typeof meetingTools>) {
  return createSdkMcpServer({
    name: "meeting",
    version: "0.2.0",
    instructions:
      "Tools for the meeting the coach is attached to. Call live_transcript before answering anything about what was said.",
    tools: meetingTools(...args).map((entry) =>
      sdkTool(
        entry.name,
        entry.description,
        entry.inputSchema,
        entry.handler,
        entry.options,
      ),
    ),
  });
}
