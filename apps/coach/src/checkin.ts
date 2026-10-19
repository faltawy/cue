export const NOTHING = "NOTHING";

export function isNothing(answer: string): boolean {
  return answer.trim().replace(/[.*`]/g, "") === NOTHING;
}

export const CATCH_UP_WINDOW_MS = 10 * 60_000;

export function catchUpPrompt(sinceMs: number): string {
  return `The user pressed "Catch me up". Call mcp__meeting__live_transcript with since_ms=${sinceMs} and tell them where the meeting stands and what to do next, in at most 5 short lines:
- what is being discussed right now, in one line
- anything aimed at the user that is still open (a question, a request, pushback), with the answer if the project has it (cite the file)
- what the user has committed to, and any commitment still missing an owner or a date
- last, the next best move: one line they can say now, as Say: "…" or Ask: "…"
Always answer. If almost nothing has been said yet, say that in one line.`;
}
