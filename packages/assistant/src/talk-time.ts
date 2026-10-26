import { formatTimestamp } from "./timestamp";
const OTHERS_SHOWN = 3;
export type TalkStats = {
  spanMs: number;
  totalMs: number;
  speakers: Array<{ speaker: string; ms: number }>;
  youLongestMs: number;
  youQuestions: number;
};

export type TalkShares = {
  youMs: number;
  shown: Array<{ speaker: string; ms: number }>;
  rest: { ms: number; speakers: number } | null;
};

export function talkShares(
  stats: TalkStats,
  othersShown = OTHERS_SHOWN,
): TalkShares {
  const others = stats.speakers.filter((entry) => entry.speaker !== "You");
  const shown =
    others.length > othersShown ? others.slice(0, othersShown - 1) : others;
  const folded = others.slice(shown.length);
  return {
    youMs: stats.speakers.find((entry) => entry.speaker === "You")?.ms ?? 0,
    shown,
    rest:
      folded.length > 0
        ? {
            ms: folded.reduce((sum, entry) => sum + entry.ms, 0),
            speakers: folded.length,
          }
        : null,
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
