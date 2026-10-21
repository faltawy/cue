import { afterEach, beforeEach, describe, expect, jest, mock, spyOn, test } from "bun:test";

import { z } from "zod";

import moments from "./fixtures/triage-moments.json";
import { type NudgeRequest, PROACTIVE_DEFAULTS, Proactive } from "./proactive";
import type { TranscriptLine } from "./transcript";
import { parseTriage, type TriageRequest, type TriageResult } from "./triage";

const momentSchema = z.object({
  id: z.string(),
  lang: z.enum(["en", "ar"]),
  lines: z.array(z.tuple([z.string(), z.string()])).min(1),
  flagged: z.boolean().optional(),
  nudge: z.boolean(),
  reply: z.string(),
});

const MOMENTS = z.object({ moments: z.array(momentSchema) }).parse(moments).moments;

function replay(moment: z.infer<typeof momentSchema>) {
  const lines: TranscriptLine[] = moment.lines.map(([speaker, text], index) => ({
    speaker,
    channel: speaker === "You" ? 0 : 1,
    start_ms: 60_000 + index * 6_000,
    end_ms: 64_000 + index * 6_000,
    text,
  }));
  const triage = mock(
    async (_request: TriageRequest): Promise<TriageResult> => ({
      verdict: parseTriage(moment.reply),
      spend: { usd: 0.0002, tokens: 1_400, cachedTokens: 0 },
    }),
  );
  const nudge = mock((_request: NudgeRequest) => true);
  const proactive = new Proactive(
    { ...PROACTIVE_DEFAULTS, enabled: true },
    { triage, nudge, busy: () => false, context: () => "Rollout sync · with Omar, Sara", changed: () => {} },
  );
  return { lines, triage, nudge, proactive };
}

const settle = async () => {
  for (let step = 0; step < 5; step += 1) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
  spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  mock.restore();
});

describe("triage eval: labelled meeting moments through detectors, the reply parser and the nudge policy", () => {
  test.each(MOMENTS.map((moment) => [moment.id, moment] as const))("%s", async (_, moment) => {
    const run = replay(moment);
    for (let second = 0; second < 4; second += 1) {
      jest.advanceTimersByTime(1_000);
      run.proactive.observe({ lines: run.lines, pending: "", live: true, selfName: "Ahmad Falta" });
    }
    await settle();
    expect(run.triage).toHaveBeenCalledTimes(1);
    expect(run.nudge.mock.calls.length).toBe(moment.nudge ? 1 : 0);
    expect(run.triage.mock.calls[0]?.[0].lines.map((line) => line.text)).toContain(moment.lines.at(-1)?.[1]);
  });

  test("the set has at least 20 moments in English and Arabic, and the replies decide for flagged small talk", () => {
    expect(MOMENTS.length).toBeGreaterThanOrEqual(20);
    expect(MOMENTS.filter((moment) => moment.lang === "ar").length).toBeGreaterThanOrEqual(5);
    expect(MOMENTS.filter((moment) => moment.flagged === true && !moment.nudge).length).toBeGreaterThanOrEqual(5);
  });
});
