export const NOTHING = "NOTHING";

export function isNothing(answer: string): boolean {
  return answer.trim().replace(/[.*`]/g, "") === NOTHING;
}

export const CATCH_UP_WINDOW_MS = 10 * 60_000;

export function catchUpPrompt(sinceMs: number): string {
  return `The user pressed "Catch me up". Call mcp__meeting__live_transcript with since_ms=${sinceMs} and tell them where the meeting stands, in at most 4 short lines:
- what is being discussed right now
- any question aimed at the user that is still unanswered, with the answer if the project has it (cite the file)
- anything the user has committed to
Always answer. If almost nothing has been said yet, say that in one line.`;
}
