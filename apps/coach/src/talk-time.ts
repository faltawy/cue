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
