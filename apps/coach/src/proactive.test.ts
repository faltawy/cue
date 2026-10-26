import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  mock,
  spyOn,
  test,
} from "bun:test";

import { MeetingIntent } from "@anlg/assistant/coaching-preferences";
import { type Spend, spendOf } from "@anlg/assistant/pricing";

import { HitKind } from "./detect";
import {
  SpendSource,
  NudgePath,
  ProactiveState,
  type NudgeRequest,
  NudgeDispatch,
  PROACTIVE_DEFAULTS,
  Proactive,
  type ProactiveConfig,
} from "./proactive";
import type { TranscriptLine } from "./transcript";
import type { TriageRequest, TriageResult, TriageVerdict } from "./triage";

const line = (
  speaker: string,
  text: string,
  startS: number,
  endS: number,
): TranscriptLine => ({
  speaker,
  channel: speaker === "You" ? 0 : 1,
  start_ms: startS * 1_000,
  end_ms: endS * 1_000,
  text,
});

const QUESTION = line("Omar", "Can you Bcc every reply to our CRM?", 60, 63);
const NUMBER_CUE = line("Omar", "It costs $240 per month.", 60, 63);
const SMALL_TALK = line(
  "Omar",
  "The weather has been lovely this week.",
  50,
  53,
);

const TRIAGE_SPEND: Spend = { usd: 0.0002, tokens: 1_400, cachedTokens: 0 };

function harness(
  options: {
    verdict?: TriageVerdict | null;
    config?: Partial<ProactiveConfig>;
    spend?: Spend;
    triageResult?: (request: TriageRequest) => Promise<TriageResult>;
  } = {},
) {
  let busy = false;
  const triage = mock(
    options.triageResult ??
      (async (_request: TriageRequest): Promise<TriageResult> => ({
        verdict:
          options.verdict === undefined
            ? { nudge: true, why: "Omar asked about Bcc" }
            : options.verdict,
        spend: options.spend ?? TRIAGE_SPEND,
      })),
  );
  const nudge = mock(
    (_request: NudgeRequest): NudgeDispatch => NudgeDispatch.Started,
  );
  const metric = mock();
  const changed = mock();
  const proactive = new Proactive(
    { ...PROACTIVE_DEFAULTS, enabled: true, ...options.config },
    {
      triage,
      nudge,
      busy: () => busy,
      context: () => "Weekly sync · with Omar",
      changed,
      metric,
    },
  );
  let lines: TranscriptLine[] = [];
  let pending = "";
  let live = true;
  const observe = () =>
    proactive.observe({ lines, pending, live, selfName: "Ahmad Falta" });
  return {
    proactive,
    triage,
    nudge,
    changed,
    metric,
    setBusy: (value: boolean) => {
      busy = value;
    },
    end: () => {
      live = false;
    },
    restart: () => {
      live = true;
    },
    say: (...next: TranscriptLine[]) => {
      lines = [...lines, ...next];
      pending = "";
    },
    speaking: (text: string) => {
      pending = text;
    },
    tick: (seconds = 1) => {
      for (let step = 0; step < seconds; step += 1) {
        jest.advanceTimersByTime(1_000);
        observe();
      }
    },
  };
}

const settle = async () => {
  for (let step = 0; step < 5; step += 1) await Promise.resolve();
};

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("Proactive: hit → fast nudge or fallback triage", () => {
  test("waits through ongoing speech and invalidates a generated suggestion when the question is answered", () => {
    const coach = harness();
    coach.say(QUESTION, line("Omar", "There is one more detail.", 63, 64));
    for (let second = 0; second < 12; second += 1) {
      coach.speaking(`Let me finish the question ${second}`);
      coach.tick();
    }
    expect(coach.nudge.mock.calls).toHaveLength(0);
    coach.say(line("Omar", "Can you confirm that?", 64, 66));
    coach.tick(3);
    const request = coach.nudge.mock.calls[0]?.[0];
    expect(request?.lines).toContain(QUESTION);
    expect(coach.proactive.canDeliver(request!)).toBe(true);
    coach.say(
      line("You", "Yes, every reply can be copied to your CRM.", 67, 70),
    );
    coach.tick(3);
    expect(coach.proactive.canDeliver(request!)).toBe(false);
  });

  test("quiet mode suppresses the same live cue and resuming accepts a fresh question", () => {
    const coach = harness();
    coach.proactive.setCoaching({
      intent: MeetingIntent.Listening,
      quiet: true,
    });
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.proactive.view().state).toBe(ProactiveState.Quiet);
    expect(coach.nudge.mock.calls).toHaveLength(0);
    coach.proactive.setCoaching({
      intent: MeetingIntent.Listening,
      quiet: false,
    });
    coach.tick(3);
    expect(coach.nudge.mock.calls).toHaveLength(0);
    coach.say(line("Omar", "Can you send a sample?", 70, 73));
    coach.tick(3);
    expect(coach.nudge.mock.calls[0]?.[0]).toMatchObject({
      intent: "listening",
    });
    expect(coach.proactive.canDeliver(coach.nudge.mock.calls[0]![0])).toBe(
      true,
    );
    coach.proactive.setCoaching({
      intent: MeetingIntent.Presenting,
      quiet: false,
    });
    expect(coach.proactive.canDeliver(coach.nudge.mock.calls[0]![0])).toBe(
      false,
    );
  });

  test("timing feedback waits for a longer opening and slow suggestions expire", () => {
    const normal = harness();
    normal.say(QUESTION);
    normal.tick(3);
    const normalRequest = normal.nudge.mock.calls[0]![0];
    expect(normalRequest.lines).toEqual([QUESTION]);
    expect(normal.proactive.canDeliver(normalRequest)).toBe(true);

    const careful = harness();
    careful.proactive.setCoaching(
      { intent: MeetingIntent.General, quiet: false },
      true,
    );
    careful.say(QUESTION);
    careful.tick(3);
    expect(careful.nudge.mock.calls).toHaveLength(0);
    careful.tick();
    const request = careful.nudge.mock.calls[0]![0];
    expect(request.lines).toEqual([QUESTION]);
    expect(careful.proactive.canDeliver(request)).toBe(true);
    careful.tick(31);
    expect(careful.proactive.canDeliver(request)).toBe(false);
  });

  test.each([
    ["question", QUESTION],
    ["objection", line("Omar", "That price is too expensive for us.", 60, 63)],
    [
      "commitment",
      line("You", "I'll send the rollout plan by Friday.", 60, 63),
    ],
  ] as const)(
    "a clear %s cue starts one fast nudge without triage",
    async (_, cue) => {
      const coach = harness();
      coach.say(cue);
      coach.tick(3);

      expect(coach.triage).not.toHaveBeenCalled();
      expect(coach.nudge).toHaveBeenCalledTimes(1);
      expect(coach.nudge.mock.calls[0]?.[0]).toMatchObject({
        path: "fast",
        observedAtMs: expect.any(Number),
        priorSpend: { usd: 0, tokens: 0, cachedTokens: 0 },
      });
    },
  );

  test("a number-only cue remains on multilingual triage", () => {
    const coach = harness();
    coach.say(line("Omar", "It costs $240 per month.", 60, 63));
    coach.tick(3);

    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("a question waits for the pause, then one fast nudge carries the new lines", async () => {
    const coach = harness();
    coach.say(SMALL_TALK, QUESTION);
    coach.tick(2);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.tick(1);
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    const request = coach.nudge.mock.calls[0]?.[0];
    expect(request?.path).toBe(NudgePath.Fast);
    expect(request?.hits.map((hit) => hit.kind)).toEqual([HitKind.Question]);
    expect(request?.lines).toEqual([SMALL_TALK, QUESTION]);
  });

  test.each([
    ["triage says no", { nudge: false, why: "rhetorical" }],
    ["triage reply was malformed", null],
  ])("%s: triage runs, no coach turn starts", async (_, verdict) => {
    const coach = harness({ verdict });
    coach.say(NUMBER_CUE);
    coach.tick(3);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("discards triage when the recent transcript changes before its verdict arrives", async () => {
    let resolveFirst!: (result: TriageResult) => void;
    let calls = 0;
    const first = new Promise<TriageResult>((resolve) => {
      resolveFirst = resolve;
    });
    const coach = harness({
      triageResult: () => {
        calls += 1;
        return calls === 1
          ? first
          : Promise.resolve({
              verdict: { nudge: false, why: "The moment has passed" },
              spend: TRIAGE_SPEND,
            });
      },
    });
    coach.say(NUMBER_CUE);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);

    coach.say(line("Omar", "Let's move on to the launch plan.", 64, 68));
    coach.tick();
    resolveFirst({
      verdict: { nudge: true, why: "Check the price" },
      spend: TRIAGE_SPEND,
    });
    await settle();

    expect(coach.nudge).not.toHaveBeenCalled();
    expect(coach.metric).toHaveBeenCalledWith(
      expect.objectContaining({ path: "fallback", outcome: "suppressed" }),
    );
  });

  test("discards triage from before a recording stop and restart", async () => {
    let resolveFirst!: (result: TriageResult) => void;
    const first = new Promise<TriageResult>((resolve) => {
      resolveFirst = resolve;
    });
    const coach = harness({ triageResult: () => first });
    coach.say(NUMBER_CUE);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);

    coach.end();
    coach.tick();
    coach.restart();
    coach.tick();
    resolveFirst({
      verdict: { nudge: true, why: "Check the price" },
      spend: TRIAGE_SPEND,
    });
    await settle();

    expect(coach.nudge).not.toHaveBeenCalled();
    expect(coach.metric).toHaveBeenCalledWith(
      expect.objectContaining({ path: "fallback", outcome: "suppressed" }),
    );
  });

  test("small talk reaches triage and stays quiet, then a later question takes the fast path", async () => {
    const coach = harness({ verdict: { nudge: false, why: "small talk" } });
    coach.say(SMALL_TALK);
    coach.tick(5);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
    coach.tick(15);
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
  });

  test("triages a non-English window even when local detectors find no hit", async () => {
    const coach = harness({ verdict: { nudge: true, why: "Open question" } });
    const spanish = line(
      "Omar",
      "Podrías confirmar quién aprobará el presupuesto",
      60,
      64,
    );
    coach.say(spanish);
    coach.tick(3);

    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.triage.mock.calls[0]?.[0]).toEqual({
      intent: MeetingIntent.General,
      context: "Weekly sync · with Omar",
      kinds: [],
      lines: [spanish],
    });
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.nudge.mock.calls[0]?.[0].lines).toEqual([spanish]);
  });

  test("a fast cue does not hide an unmatched-language line in the same window", async () => {
    const coach = harness({
      verdict: { nudge: false, why: "already handled" },
    });
    const spanish = line(
      "Omar",
      "Podrías confirmar quién aprobará el presupuesto",
      64,
      68,
    );
    coach.say(QUESTION, spanish);
    coach.tick(3);

    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.nudge.mock.calls[0]?.[0].path).toBe(NudgePath.Fast);
    expect(coach.triage).not.toHaveBeenCalled();

    coach.tick(PROACTIVE_DEFAULTS.nudgeGapMs / 1_000);
    await settle();

    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.triage.mock.calls[0]?.[0].lines).toContain(spanish);
  });

  test("an unclear non-English window is triaged and stays quiet", async () => {
    const coach = harness({ verdict: { nudge: false, why: "unclear" } });
    const spanish = line("Omar", "Bueno, seguimos con lo siguiente.", 60, 64);
    coach.say(spanish);
    coach.tick(3);
    await settle();

    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.triage.mock.calls[0]?.[0].lines).toEqual([spanish]);
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("the window sent to triage is the last 90 seconds only", () => {
    const coach = harness();
    const early = line("Omar", "Early chatter about the agenda.", 0, 4);
    const late = line("Omar", "We have 42 agents now.", 200, 203);
    coach.say(early, late);
    coach.tick(3);
    expect(coach.triage.mock.calls[0]?.[0].lines).toEqual([late]);
  });
});

describe("Proactive: debounce and cooldown", () => {
  test("ongoing speech holds the fast cue until the speaker finishes", () => {
    const coach = harness();
    coach.say(
      QUESTION,
      line("You", "Hmm, let me think about that one.", 64, 66),
    );
    for (let second = 1; second <= 8; second += 1) {
      coach.speaking(`and the other thing ${second}`);
      coach.tick(1);
    }
    expect(coach.triage).not.toHaveBeenCalled();
    coach.speaking("and the other thing 9");
    coach.tick(1);
    expect(coach.triage).not.toHaveBeenCalled();
    expect(coach.nudge.mock.calls).toHaveLength(0);
    coach.say(line("Omar", "Can you help us with that?", 67, 70));
    coach.tick(3);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
  });

  test("hits right after a nudge wait out the cooldown", async () => {
    const coach = harness();
    coach.say(QUESTION);
    coach.tick(3);
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    coach.say(
      line("Omar", "Can you send the pricing sheet?", 80, 82),
      line("Omar", "It is $1,200 a month.", 83, 85),
    );
    coach.tick(55);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.tick(5);
    expect(coach.nudge).toHaveBeenCalledTimes(2);
    expect(coach.nudge.mock.calls[1]?.[0].path).toBe(NudgePath.Fast);
  });

  test("a number hit stays held while a turn is running, then reaches triage", () => {
    const coach = harness();
    coach.setBusy(true);
    coach.say(NUMBER_CUE);
    coach.tick(10);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.setBusy(false);
    coach.tick(1);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("an old held fast hit expires, and a new number cue reaches triage", () => {
    const coach = harness();
    coach.setBusy(true);
    coach.say(QUESTION);
    coach.tick(95);
    coach.setBusy(false);
    coach.tick(3);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.say(line("Omar", "We have 60 agents.", 170, 172));
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("a fast cue remains held while busy and dispatches once the coach is free", () => {
    const coach = harness();
    coach.setBusy(true);
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.nudge).not.toHaveBeenCalled();
    coach.setBusy(false);
    coach.tick(1);

    expect(coach.triage).not.toHaveBeenCalled();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.nudge.mock.calls[0]?.[0].path).toBe(NudgePath.Fast);
  });

  test("a fast cue declined by the app is retried on the next poll", () => {
    const coach = harness();
    coach.nudge.mockImplementationOnce(() => NudgeDispatch.Retry);
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    coach.tick(1);

    expect(coach.triage).not.toHaveBeenCalled();
    expect(coach.nudge).toHaveBeenCalledTimes(2);
    expect(coach.nudge.mock.calls[1]?.[0].path).toBe(NudgePath.Fast);
  });

  test("a fast cue the app already handled is dropped without retry or fallback triage", () => {
    const coach = harness();
    coach.nudge.mockImplementationOnce(() => NudgeDispatch.Drop);
    coach.say(QUESTION);
    coach.tick(3);
    coach.tick(3);

    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.triage).not.toHaveBeenCalled();
  });

  test("a busy turn that starts while triage runs drops the fallback nudge", async () => {
    const coach = harness();
    coach.say(NUMBER_CUE);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    coach.setBusy(true);
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
  });
});

describe("Proactive: rate limit", () => {
  const askEvery70s = async (
    coach: ReturnType<typeof harness>,
    from: number,
    count: number,
  ) => {
    for (let index = 0; index < count; index += 1) {
      const at = (from + index) * 70;
      coach.say(
        line("Omar", `Can you check item ${from + index} for us?`, at, at + 3),
      );
      coach.tick(3);
      await settle();
      coach.tick(67);
    }
  };

  test("at most 4 fast nudges in any 10 minutes, with no triage call per question", async () => {
    const coach = harness();
    await askEvery70s(coach, 0, 8);
    expect(coach.triage).not.toHaveBeenCalled();
    expect(coach.nudge).toHaveBeenCalledTimes(4);
  });

  test("the window rolls: once the first nudge is 10 minutes old, the next question nudges again", async () => {
    const coach = harness();
    await askEvery70s(coach, 0, 8);
    expect(coach.nudge).toHaveBeenCalledTimes(4);
    coach.tick(50);
    coach.say(line("Omar", "Can you send the contract today?", 620, 623));
    coach.tick(3);
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(5);
  });
});

describe("Proactive: budget", () => {
  test("unpriced triage stops automatic calls but retains usage instead of pretending the cap was reached", async () => {
    const known = harness();
    known.say(NUMBER_CUE);
    known.tick(3);
    await settle();
    expect(known.nudge).toHaveBeenCalled();

    const unknown = harness({
      spend: { usd: null, tokens: 1_400, cachedTokens: 200 },
    });
    unknown.say(NUMBER_CUE);
    unknown.tick(3);
    await settle();
    expect(unknown.proactive.view()).toMatchObject({
      state: "unpriced",
      nudgesUsd: null,
      meetingUsd: null,
      meetingTokens: 1_400,
      cachedTokens: 200,
    });
    expect(unknown.nudge).not.toHaveBeenCalled();
    unknown.say(line("Omar", "We have 60 agents.", 170, 172));
    unknown.tick(80);
    await settle();
    expect(unknown.proactive.view().meetingTokens).toBe(1_400);
    expect(unknown.triage).toHaveBeenCalledTimes(1);
  });

  test("triage and nudges count toward the cap; asks only toward the meeting total", async () => {
    const coach = harness();
    coach.say(NUMBER_CUE);
    coach.tick(3);
    await settle();
    coach.proactive.spend(SpendSource.Nudges, {
      usd: 0.0098,
      tokens: 3_100,
      cachedTokens: 0,
    });
    coach.proactive.spend(SpendSource.Asks, {
      usd: 0.05,
      tokens: 40_000,
      cachedTokens: 35_000,
    });
    const view = coach.proactive.view();
    expect(view.nudgesUsd).toBeCloseTo(0.01, 6);
    expect(view.meetingUsd).toBeCloseTo(0.06, 6);
    expect(view).toMatchObject({
      state: "on",
      capUsd: 0.5,
      meetingTokens: 44_500,
      cachedTokens: 35_000,
    });
    expect(coach.changed).toHaveBeenLastCalledWith(coach.proactive.view());
  });

  test("cache reads alone can reach the cap: 250k cached Sonnet tokens are $0.05", async () => {
    const cached = (tokens: number) =>
      spendOf("sonnet", {
        inputTokens: 0,
        cachedInputTokens: tokens,
        cacheCreationTokens: 0,
        outputTokens: 0,
      });
    const coach = harness({
      config: { capUsd: 0.05 },
      spend: { usd: 0, tokens: 0, cachedTokens: 0 },
    });
    coach.proactive.spend(SpendSource.Nudges, cached(249_000));
    coach.say(NUMBER_CUE);
    coach.tick(3);
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);

    coach.proactive.spend(SpendSource.Nudges, cached(1_000));
    coach.say(line("Omar", "Do you have the numbers?", 170, 172));
    coach.tick(80);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.proactive.view().state).toBe(ProactiveState.Capped);
  });

  test("asks never pause nudges, however much they cost", () => {
    const coach = harness({ config: { capUsd: 0.05 } });
    coach.proactive.spend(SpendSource.Asks, {
      usd: 3,
      tokens: 1_000_000,
      cachedTokens: 900_000,
    });
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.triage).not.toHaveBeenCalled();
    expect(coach.proactive.view().state).toBe(ProactiveState.On);
  });

  test("once the cap is reached no triage call is made and the view says capped", () => {
    const open = harness();
    open.say(NUMBER_CUE);
    open.tick(3);
    expect(open.triage).toHaveBeenCalledTimes(1);

    const capped = harness({ config: { capUsd: 0.05 } });
    capped.proactive.spend(SpendSource.Nudges, {
      usd: 0.05,
      tokens: 9_000,
      cachedTokens: 0,
    });
    capped.say(QUESTION);
    capped.tick(3);
    expect(capped.triage).not.toHaveBeenCalled();
    expect(capped.proactive.view().state).toBe(ProactiveState.Capped);
  });

  test("triage that pushes the total over the cap does not start the nudge", async () => {
    const coach = harness({
      spend: { usd: 0.006, tokens: 1_400, cachedTokens: 0 },
      config: { capUsd: 0.01 },
    });
    coach.proactive.spend(SpendSource.Nudges, {
      usd: 0.005,
      tokens: 1_000,
      cachedTokens: 0,
    });
    coach.say(NUMBER_CUE);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
    expect(coach.proactive.view().state).toBe(ProactiveState.Capped);
  });

  test("turned off: never triages, though the same lines would", () => {
    const on = harness();
    on.say(NUMBER_CUE);
    on.tick(3);
    expect(on.triage).toHaveBeenCalledTimes(1);

    const off = harness({ config: { enabled: false } });
    off.say(QUESTION);
    off.tick(3);
    expect(off.triage).not.toHaveBeenCalled();
    expect(off.proactive.view().state).toBe(ProactiveState.Off);
  });
});

describe("Proactive: failures", () => {
  test("a triage that throws is logged, and the next hit still gets triaged", async () => {
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const coach = harness();
      coach.triage.mockImplementationOnce(async () => {
        throw new Error("claude exited");
      });
      coach.say(NUMBER_CUE);
      coach.tick(3);
      await settle();
      expect(coach.nudge).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      coach.say(line("Omar", "The sync covers 120 users.", 120, 123));
      coach.tick(20);
      await settle();
      expect(coach.triage).toHaveBeenCalledTimes(2);
      expect(coach.nudge).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});

describe("Proactive: objections", () => {
  const PUSHBACK = line(
    "Omar",
    "Honestly, this is too expensive for a team our size.",
    60,
    64,
  );

  test("pushback from the other side takes the fast path and carries the objection", async () => {
    const coach = harness();
    coach.say(PUSHBACK);
    coach.tick(3);
    expect(coach.triage).not.toHaveBeenCalled();
    await settle();
    expect(coach.nudge.mock.calls[0]?.[0].hits).toEqual([
      { kind: HitKind.Objection, lineIndex: 0, text: PUSHBACK.text },
    ]);
    expect(coach.nudge.mock.calls[0]?.[0].path).toBe(NudgePath.Fast);
  });

  test("the user's pushback-shaped speech reaches triage and stays quiet", async () => {
    const coach = harness({
      verdict: { nudge: false, why: "not a useful moment" },
    });
    coach.say(line("You", PUSHBACK.text, 60, 64));
    coach.tick(10);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("a triage still running when the meeting ends starts no nudge", async () => {
    let answer: (result: TriageResult) => void = () => {};
    const coach = harness();
    coach.triage.mockImplementationOnce(
      () =>
        new Promise<TriageResult>((resolve) => {
          answer = resolve;
        }),
    );
    coach.say(NUMBER_CUE);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    coach.end();
    coach.tick(1);
    answer({
      verdict: { nudge: true, why: "price pushback" },
      spend: TRIAGE_SPEND,
    });
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
  });
});

describe("Proactive: long monologues", () => {
  const MORE = "And here is the next part of how the inbox works.";
  const talk = async (
    coach: ReturnType<typeof harness>,
    fromS: number,
    toS: number,
    speaker = "You",
  ) => {
    for (let at = fromS; at < toS; at += 10) {
      coach.say(line(speaker, MORE, at, at + 10));
      coach.tick(10);
      await settle();
    }
  };
  const NO = { nudge: false, why: "already handled" };

  test("the user talking 90 seconds straight gets one hand-over nudge while transcript windows keep triaging", async () => {
    const coach = harness({ verdict: NO });
    await talk(coach, 0, 80);
    expect(coach.nudge).not.toHaveBeenCalled();
    await talk(coach, 80, 90);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    const request = coach.nudge.mock.calls[0]?.[0];
    expect(request?.hits).toEqual([
      { kind: HitKind.Monologue, lineIndex: 8, text: MORE },
    ]);
    expect(request?.why).toBe("You have talked for 01:30 without handing over");
    expect(request?.context).toBe("Weekly sync · with Omar");
    await talk(coach, 90, 300);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    expect(coach.triage).toHaveBeenCalled();
  });

  test("backchannels do not reset the stretch; a question from the other side gets a fast response", async () => {
    const backchannel = harness({ verdict: NO });
    await talk(backchannel, 0, 50);
    backchannel.say(line("Omar", "Mm-hm.", 50, 51));
    await talk(backchannel, 51, 91);
    expect(backchannel.nudge).toHaveBeenCalledTimes(1);

    const asked = harness({ verdict: NO });
    await talk(asked, 0, 50);
    asked.say(line("Omar", "How much?", 50, 51));
    await talk(asked, 51, 91);
    expect(
      asked.triage.mock.calls.some(
        ([request]) =>
          request.kinds.includes(HitKind.Question) &&
          request.lines.some((entry) => entry.text === "How much?"),
      ),
    ).toBe(false);
    expect(asked.nudge).toHaveBeenCalledTimes(1);
    expect(asked.nudge.mock.calls[0]?.[0].hits[0]?.text).toBe("How much?");
    expect(asked.nudge.mock.calls[0]?.[0].path).toBe(NudgePath.Fast);
    await talk(asked, 91, 141);
    expect(asked.nudge).toHaveBeenCalledTimes(2);
    expect(asked.nudge.mock.calls[1]?.[0].hits[0]?.kind).toBe(
      HitKind.Monologue,
    );
  });

  test("a second monologue right after the first waits out the cooldown", async () => {
    const coach = harness({ verdict: NO });
    await talk(coach, 0, 90);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    coach.say(
      line(
        "Omar",
        "Okay, so what would the rollout look like for us then?",
        90,
        96,
      ),
    );
    coach.tick(6);
    await settle();
    await talk(coach, 96, 196);
    expect(coach.nudge).toHaveBeenCalledTimes(2);
    await talk(coach, 196, 396);
    expect(coach.nudge.mock.calls.length).toBeLessThanOrEqual(4);
  });

  test("the other side talking for minutes is not the user's monologue", async () => {
    const coach = harness({ verdict: NO });
    await talk(coach, 0, 200, "Omar");
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("monologue reminders respect meeting roles, availability and limits on the same transcript", async () => {
    const open = harness({ verdict: NO });
    await talk(open, 0, 90);
    expect(open.nudge).toHaveBeenCalledTimes(1);

    const off = harness({ config: { enabled: false } });
    await talk(off, 0, 120);
    const capped = harness({ config: { capUsd: 0.05 } });
    capped.proactive.spend(SpendSource.Nudges, {
      usd: 0.05,
      tokens: 9_000,
      cachedTokens: 0,
    });
    await talk(capped, 0, 120);
    const busy = harness({ verdict: NO });
    busy.setBusy(true);
    await talk(busy, 0, 120);
    const ended = harness({ verdict: NO });
    await talk(ended, 0, 80);
    ended.end();
    await talk(ended, 80, 120);
    const presenting = harness({ verdict: NO });
    presenting.proactive.setCoaching({
      intent: MeetingIntent.Presenting,
      quiet: false,
    });
    await talk(presenting, 0, 120);
    const listening = harness({ verdict: NO });
    listening.proactive.setCoaching({
      intent: MeetingIntent.Listening,
      quiet: false,
    });
    await talk(listening, 0, 120);
    for (const coach of [off, capped, busy, ended, presenting, listening])
      expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("a nudge declined by the app is retried on the next look, not dropped", async () => {
    const coach = harness({ verdict: NO });
    coach.nudge.mockImplementationOnce(() => NudgeDispatch.Retry);
    await talk(coach, 0, 80);
    coach.say(line("You", MORE, 80, 90));
    coach.tick(3);
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    coach.tick(1);
    expect(coach.nudge).toHaveBeenCalledTimes(2);
  });
});
