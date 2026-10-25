import { type Move } from "./move";
import { type NudgeResult } from "./nudge";
import { NudgeOutcome } from "./nudge-outcome";
import { type TalkStats } from "./talk-time";

export async function deliverNudge(
  generate: () => Promise<NudgeResult>,
  delivery: {
    signal: AbortSignal;
    current(): boolean;
    canDeliver(): boolean;
    publish(move: Move, talk: TalkStats | null): void;
    defer(note: string): void;
  },
) {
  const result = await generate();
  if (delivery.signal.aborted || !delivery.current())
    return { result, outcome: NudgeOutcome.Suppressed };
  if (!result.ok) return { result, outcome: NudgeOutcome.Error };
  if (result.deferred) {
    delivery.defer(result.deferred);
    return { result, outcome: NudgeOutcome.Later };
  }
  if (!result.move) return { result, outcome: NudgeOutcome.Silence };
  if (!delivery.canDeliver())
    return { result, outcome: NudgeOutcome.Suppressed };
  delivery.publish(result.move, result.talk);
  return { result, outcome: NudgeOutcome.Nudge };
}
