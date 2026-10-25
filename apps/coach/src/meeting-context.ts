import { z } from "zod";

import { askContent, type AskContent, type AskImage, thumbsOf } from "./images";
import { type CoachEvent, CoachEventType, type TurnKind } from "./protocol";

const meetingRefSchema = z.object({ id: z.string(), title: z.string() });

export const meetingSeenSchema = meetingRefSchema.extend({
  live: z.boolean(),
  elsewhere: meetingRefSchema.nullable(),
});

export type MeetingSeen = z.infer<typeof meetingSeenSchema>;

export type MeetingNow = MeetingSeen & {
  people: string[];
  startedAtMs: number | null;
  endedAtMs: number | null;
};

const MINUTE_MS = 60_000;

function span(ms: number): string {
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)} days`;
}

function stateText(meeting: MeetingNow, nowMs: number): string {
  if (meeting.live) {
    if (meeting.startedAtMs === null) return "live";
    const elapsed = nowMs - meeting.startedAtMs;
    return elapsed < MINUTE_MS
      ? "live, just started"
      : `live, ${span(elapsed)} in`;
  }
  if (meeting.endedAtMs === null) return "ended";
  const since = nowMs - meeting.endedAtMs;
  return since < MINUTE_MS ? "ended just now" : `ended ${span(since)} ago`;
}

function meetingLine(meeting: MeetingNow, nowMs: number): string {
  const state = stateText(meeting, nowMs);
  if (meeting.elsewhere) {
    return `[This chat is about "${meeting.title}" (${state}). The user is now in a different meeting: "${meeting.elsewhere.title}" (live). Your meeting tools act on "${meeting.title}".]`;
  }
  const people =
    meeting.people.length > 0 ? ` with ${meeting.people.join(", ")}` : "";
  return `[Meeting: "${meeting.title}"${people} · ${state}]`;
}

function sameMeeting(seen: MeetingSeen, meeting: MeetingNow): boolean {
  return (
    seen.id === meeting.id &&
    seen.title === meeting.title &&
    seen.live === meeting.live &&
    seen.elsewhere?.id === meeting.elsewhere?.id &&
    seen.elsewhere?.title === meeting.elsewhere?.title
  );
}

export function meetingUpdate(
  seen: MeetingSeen | undefined,
  meeting: MeetingNow | null,
  nowMs: number,
): { line: string | null; seen: MeetingSeen | undefined } {
  if (!meeting || (seen && sameMeeting(seen, meeting)))
    return { line: null, seen };
  const { id, title, live, elsewhere } = meeting;
  return {
    line: meetingLine(meeting, nowMs),
    seen: { id, title, live, elsewhere },
  };
}

export function userTurn(input: {
  kind: TurnKind;
  label: string;
  prompt: string;
  line: string | null;
  images: readonly AskImage[];
}): { event: CoachEvent; content: AskContent } {
  const { kind, label, prompt, line, images } = input;
  return {
    event: {
      type: CoachEventType.User,
      kind,
      text: label,
      ...(images.length > 0 ? { images: thumbsOf(images) } : {}),
    },
    content: askContent(line ? `${line}\n\n${prompt}` : prompt, images),
  };
}
