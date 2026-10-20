import { asksQuestion, normalize } from "./detect";
import { formatTimestamp } from "./timestamp";
import type { TranscriptLine } from "./transcript";

export const TALK_WINDOW_MS = 10 * 60_000;
const MIN_TALK_MS = 60_000;
const OTHERS_SHOWN = 3;

export type TalkStats = {
  spanMs: number;
  totalMs: number;
  speakers: Array<{ speaker: string; ms: number }>;
  youLongestMs: number;
  youQuestions: number;
};

export function talkStats(lines: readonly TranscriptLine[], windowMs = TALK_WINDOW_MS): TalkStats | null {
  const latestEnd = lines.at(-1)?.end_ms ?? 0;
  const from = latestEnd - windowMs;
  const recent = lines.filter((line) => line.end_ms > from);
  const bySpeaker = new Map<string, number>();
  let youLongestMs = 0;
  let stretchStart: number | null = null;
  let youQuestions = 0;
  for (const line of recent) {
    const start = Math.max(line.start_ms, from);
    bySpeaker.set(line.speaker, (bySpeaker.get(line.speaker) ?? 0) + line.end_ms - start);
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
    .sort((a, b) => Number(b.speaker === "You") - Number(a.speaker === "You") || b.ms - a.ms);
  const firstStart = Math.max(recent[0]?.start_ms ?? from, from);
  return { spanMs: latestEnd - firstStart, totalMs, speakers, youLongestMs, youQuestions };
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
  if (asksQuestion(line.text) || (/[?؟]/.test(line.text) && spoken.length > 1)) return false;
  if (line.end_ms - line.start_ms <= BACKCHANNEL_MS) return true;
  return spoken.length > 0 && spoken.every((word) => BACKCHANNEL_WORDS.has(word));
}

export type Monologue = { startMs: number; ms: number; lineIndex: number };

export function monologue(lines: readonly TranscriptLine[]): Monologue | null {
  let lastIndex: number | null = null;
  let startMs = 0;
  let endMs = 0;
  let nextStart: number | null = null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line || (nextStart !== null && nextStart - line.end_ms > MONOLOGUE_GAP_MS)) break;
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
  return lastIndex === null ? null : { startMs, ms: endMs - startMs, lineIndex: lastIndex };
}

export type TalkShares = {
  youMs: number;
  shown: Array<{ speaker: string; ms: number }>;
  rest: { ms: number; speakers: number } | null;
};

export function talkShares(stats: TalkStats, othersShown = OTHERS_SHOWN): TalkShares {
  const others = stats.speakers.filter((entry) => entry.speaker !== "You");
  const shown = others.length > othersShown ? others.slice(0, othersShown - 1) : others;
  const folded = others.slice(shown.length);
  return {
    youMs: stats.speakers.find((entry) => entry.speaker === "You")?.ms ?? 0,
    shown,
    rest: folded.length > 0 ? { ms: folded.reduce((sum, entry) => sum + entry.ms, 0), speakers: folded.length } : null,
  };
}

export function percentLabel(ms: number, totalMs: number): string {
  const percent = totalMs > 0 ? Math.round((ms / totalMs) * 100) : 0;
  if (ms > 0 && percent === 0) return "<1%";
  if (percent === 100 && ms < totalMs) return ">99%";
  return `${percent}%`;
}

export function windowMinutes(stats: TalkStats): number {
  return Math.max(1, Math.round(stats.spanMs / 60_000));
}

export function talkSummary(stats: TalkStats): string {
  const percent = (ms: number) => percentLabel(ms, stats.totalMs);
  const { youMs, shown, rest } = talkShares(stats);
  const shares = [
    `You ${percent(youMs)}`,
    ...shown.map((entry) => `${entry.speaker} ${percent(entry.ms)}`),
    ...(rest && rest.ms > 0 ? [`others ${percent(rest.ms)}`] : []),
  ];
  return `Talk time, last ${windowMinutes(stats)} min: ${shares.join(", ")} · your longest stretch ${formatTimestamp(stats.youLongestMs)} · questions you asked: ${stats.youQuestions}`;
}
