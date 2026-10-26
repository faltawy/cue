import { type TalkStats } from "@anlg/assistant/talk-time";
export {
  type TalkStats,
  type TalkShares,
  talkShares,
  percentLabel,
  windowMinutes,
  talkSummary,
} from "@anlg/assistant/talk-time";
import { asksQuestion, normalize } from "./detect";
import type { TranscriptLine } from "./transcript";

export const TALK_WINDOW_MS = 10 * 60_000;
const MIN_TALK_MS = 60_000;

export function talkStats(
  lines: readonly TranscriptLine[],
  windowMs = TALK_WINDOW_MS,
): TalkStats | null {
  const latestEnd = lines.at(-1)?.end_ms ?? 0;
  const from = latestEnd - windowMs;
  const recent = lines.filter((line) => line.end_ms > from);
  const bySpeaker = new Map<string, number>();
  let youLongestMs = 0;
  let stretchStart: number | null = null;
  let youQuestions = 0;
  for (const line of recent) {
    const start = Math.max(line.start_ms, from);
    bySpeaker.set(
      line.speaker,
      (bySpeaker.get(line.speaker) ?? 0) + line.end_ms - start,
    );
    if (line.speaker !== "You") {
      stretchStart = null;
      continue;
    }
    stretchStart ??= start;
    youLongestMs = Math.max(youLongestMs, line.end_ms - stretchStart);
    youQuestions += line.text.match(/[?؟]/g)?.length ?? 0;
  }
  const totalMs = [...bySpeaker.values()].reduce((sum, ms) => sum + ms, 0);
  if (totalMs < MIN_TALK_MS) return null;
  const speakers = [...bySpeaker]
    .map(([speaker, ms]) => ({ speaker, ms }))
    .sort(
      (a, b) =>
        Number(b.speaker === "You") - Number(a.speaker === "You") ||
        b.ms - a.ms,
    );
  const firstStart = Math.max(recent[0]?.start_ms ?? from, from);
  return {
    spanMs: latestEnd - firstStart,
    totalMs,
    speakers,
    youLongestMs,
    youQuestions,
  };
}

const BACKCHANNEL_MS = 2_000;
const MONOLOGUE_GAP_MS = 5_000;
const BACKCHANNEL_WORDS = new Set([
  "yeah",
  "yes",
  "yep",
  "yup",
  "right",
  "ok",
  "okay",
  "sure",
  "mm",
  "mhm",
  "mm-hm",
  "mm-hmm",
  "uh-huh",
  "hmm",
  "got",
  "it",
  "i",
  "see",
  "true",
  "exactly",
  "totally",
  "cool",
  "nice",
  "great",
  "اه",
  "ايوه",
  "ايوا",
  "اي",
  "تمام",
  "صح",
  "ماشي",
  "طيب",
  "اكيد",
  "نعم",
  "اوكي",
  "حلو",
  "مظبوط",
  "بالضبط",
  "زين",
  "يب",
]);

function isBackchannel(line: TranscriptLine): boolean {
  const spoken = normalize(line.text)
    .split(/[\s,،.!?؟]+/u)
    .filter(Boolean);
  if (asksQuestion(line.text) || (/[?؟]/.test(line.text) && spoken.length > 1))
    return false;
  if (line.end_ms - line.start_ms <= BACKCHANNEL_MS) return true;
  return (
    spoken.length > 0 && spoken.every((word) => BACKCHANNEL_WORDS.has(word))
  );
}

export type Monologue = { startMs: number; ms: number; lineIndex: number };

export function monologue(lines: readonly TranscriptLine[]): Monologue | null {
  let lastIndex: number | null = null;
  let startMs = 0;
  let endMs = 0;
  let nextStart: number | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (
      !line ||
      (nextStart !== null && nextStart - line.end_ms > MONOLOGUE_GAP_MS)
    )
      break;
    if (line.speaker === "You") {
      if (lastIndex === null) {
        lastIndex = index;
        endMs = line.end_ms;
      }
      startMs = line.start_ms;
    } else if (!isBackchannel(line)) {
      break;
    }
    nextStart = line.start_ms;
  }
  return lastIndex === null
    ? null
    : { startMs, ms: endMs - startMs, lineIndex: lastIndex };
}
