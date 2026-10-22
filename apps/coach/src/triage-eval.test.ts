import { afterEach, beforeEach, describe, expect, jest, mock, spyOn, test } from "bun:test";

import { z } from "zod";

import { detectHits, type HitKind } from "./detect";
import moments from "./fixtures/triage-moments.json";
import { estimateTokens, ONE_SHOT_OVERHEAD_TOKENS } from "./pricing";
import { nudgeMessage, nudgeSystem } from "./nudge";
import { type NudgeRequest, PROACTIVE_DEFAULTS, Proactive } from "./proactive";
import type { TranscriptLine } from "./transcript";
import {
  parseTriage,
  TRIAGE_SYSTEM,
  triagePrompt,
  type TriageRequest,
  type TriageResult,
} from "./triage";

const momentSchema = z.object({
  id: z.string(),
  lang: z.enum(["en", "ar", "es"]),
  lines: z.array(z.tuple([z.string(), z.string()])).min(1),
  flagged: z.boolean().optional(),
  nudge: z.boolean(),
  reply: z.string(),
});

const MOMENTS = z.object({ moments: z.array(momentSchema) }).parse(moments).moments;
const CURRENT_FLOW_BASELINE_TOKENS = 10_181;

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
  const nudge = mock((_request: NudgeRequest) => "started" as const);
  const proactive = new Proactive(
    { ...PROACTIVE_DEFAULTS, enabled: true },
    {
      triage,
      nudge,
      busy: () => false,
      context: () => "Rollout sync · with Omar, Sara",
      changed: () => {},
      metric: () => {},
    },
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

const FALLBACK_MOMENTS = MOMENTS.filter((moment) => {
  const lines: TranscriptLine[] = moment.lines.map(([speaker, text], index) => ({
    speaker,
    channel: speaker === "You" ? 0 : 1,
    start_ms: 60_000 + index * 6_000,
    end_ms: 64_000 + index * 6_000,
    text,
  }));
  return !lines.some((line, index) =>
    detectHits(line, index, "Ahmad Falta").some((hit) =>
      ["question", "objection", "commitment"].includes(hit.kind),
    ),
  );
});

function callTokens(system: string, prompt: string, output: number): number {
  return (
    ONE_SHOT_OVERHEAD_TOKENS +
    estimateTokens(system) +
    estimateTokens(prompt) +
    output
  );
}

describe("triage eval: labelled moments on the multilingual fallback", () => {
  test.each(FALLBACK_MOMENTS.map((moment) => [moment.id, moment] as const))("%s", async (_, moment) => {
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

  test("a detector-unmatched Spanish question reaches triage and produces a fallback nudge", async () => {
    const spanish: TranscriptLine = {
      speaker: "Omar",
      channel: 1,
      start_ms: 60_000,
      end_ms: 64_000,
      text: "Podrías confirmar quién aprueba el presupuesto",
    };
    expect(detectHits(spanish, 0, "Ahmad Falta")).toEqual([]);
    const run = replay({
      id: "spanish-owner-question",
      lang: "es",
      lines: [[spanish.speaker, spanish.text]],
      nudge: true,
      reply: '{"nudge": true, "why": "Open owner question"}',
    });
    for (let second = 0; second < 4; second += 1) {
      jest.advanceTimersByTime(1_000);
      run.proactive.observe({ lines: [spanish], pending: "", live: true, selfName: "Ahmad Falta" });
    }
    await settle();
    expect(run.triage).toHaveBeenCalledTimes(1);
    expect(run.nudge).toHaveBeenCalledTimes(1);
    expect(run.nudge.mock.calls[0]?.[0].path).toBe("fallback");
    expect(run.nudge.mock.calls[0]?.[0].lines).toContainEqual(spanish);
  });

  test("a ten-minute English, Arabic, and Spanish replay estimates fewer tokens than the current two-call flow", async () => {
    jest.useRealTimers();
    let now = 0;
    let lines: TranscriptLine[] = [];
    let newFlowTokens = 0;
    let currentFlowBaselineTokens = 0;
    const context = "Rollout sync";
    const estimate = (request: NudgeRequest) => {
      const nudgePrompt = nudgeMessage(request);
      newFlowTokens += callTokens(nudgeSystem(""), nudgePrompt, 130);
      const latestEnd = request.lines.at(-1)?.end_ms ?? 0;
      currentFlowBaselineTokens += callTokens(
        TRIAGE_SYSTEM,
        triagePrompt({
          context,
          kinds: request.hits.map((hit) => hit.kind) as HitKind[],
          lines: request.lines.filter((line) => line.end_ms >= latestEnd - PROACTIVE_DEFAULTS.windowMs),
        }),
        30,
      );
      currentFlowBaselineTokens += callTokens(nudgeSystem(""), nudgePrompt, 130);
      return true;
    };
    const triage = mock(async (request: TriageRequest): Promise<TriageResult> => {
      newFlowTokens += callTokens(TRIAGE_SYSTEM, triagePrompt(request), 30);
      return { verdict: { nudge: true, why: "One open question" }, spend: { usd: 0, tokens: 0, cachedTokens: 0 } };
    });
    const nudge = mock((request: NudgeRequest) => estimate(request) ? "started" as const : "retry" as const);
    const proactive = new Proactive(
      { ...PROACTIVE_DEFAULTS, enabled: true },
      { triage, nudge, busy: () => false, context: () => context, changed: () => {}, metric: () => {}, now: () => now },
    );
    const cues: TranscriptLine[] = [
      { speaker: "Omar", channel: 1, start_ms: 60_000, end_ms: 63_000, text: "Can you confirm who owns the rollout?" },
      { speaker: "Sara", channel: 1, start_ms: 210_000, end_ms: 213_000, text: "السعر عالي على فريقنا." },
      { speaker: "Omar", channel: 1, start_ms: 360_000, end_ms: 363_000, text: "Podrías confirmar quién aprueba el presupuesto" },
      { speaker: "You", channel: 0, start_ms: 510_000, end_ms: 513_000, text: "I'll send the rollout plan by Friday." },
    ];
    for (const cue of cues) {
      lines = [...lines, cue];
      now = cue.end_ms + 2_000;
      proactive.observe({ lines, pending: "", live: true, selfName: "Ahmad Falta" });
      now += 2_000;
      proactive.observe({ lines, pending: "", live: true, selfName: "Ahmad Falta" });
      await settle();
    }
    now = 600_000;
    proactive.observe({ lines, pending: "", live: true, selfName: "Ahmad Falta" });

    expect(nudge).toHaveBeenCalledTimes(4);
    expect(triage).toHaveBeenCalledTimes(1);
    expect(nudge.mock.calls.map(([request]) => request.path)).toEqual([
      "fast",
      "fast",
      "fallback",
      "fast",
    ]);
    expect(currentFlowBaselineTokens).toBe(CURRENT_FLOW_BASELINE_TOKENS);
    expect(newFlowTokens).toBeLessThanOrEqual(CURRENT_FLOW_BASELINE_TOKENS);
  });
});
