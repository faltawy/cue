import { formatTimestamp, type TranscriptLine } from "./transcript";

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

export function talkSummary(stats: TalkStats): string {
  const percent = (ms: number) => `${Math.round((ms / stats.totalMs) * 100)}%`;
  const you = stats.speakers.find((entry) => entry.speaker === "You");
  const others = stats.speakers.filter((entry) => entry.speaker !== "You");
  const shown = others.length > OTHERS_SHOWN ? others.slice(0, OTHERS_SHOWN - 1) : others;
  const folded = others.slice(shown.length).reduce((sum, entry) => sum + entry.ms, 0);
  const shares = [
    `You ${percent(you?.ms ?? 0)}`,
    ...shown.map((entry) => `${entry.speaker} ${percent(entry.ms)}`),
    ...(folded > 0 ? [`others ${percent(folded)}`] : []),
  ];
  const minutes = Math.max(1, Math.round(stats.spanMs / 60_000));
  return `Talk time, last ${minutes} min: ${shares.join(", ")} · your longest stretch ${formatTimestamp(stats.youLongestMs)} · questions you asked: ${stats.youQuestions}`;
}
