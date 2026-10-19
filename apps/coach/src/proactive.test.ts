import { afterEach, beforeEach, describe, expect, jest, mock, spyOn, test } from "bun:test";

import { type Spend, spendOf } from "./pricing";
import { type NudgeRequest, PROACTIVE_DEFAULTS, Proactive, type ProactiveConfig } from "./proactive";
import type { TranscriptLine } from "./transcript";
import type { TriageRequest, TriageResult, TriageVerdict } from "./triage";

const line = (speaker: string, text: string, startS: number, endS: number): TranscriptLine => ({
  speaker,
  channel: speaker === "You" ? 0 : 1,
  start_ms: startS * 1_000,
  end_ms: endS * 1_000,
  text,
});

const QUESTION = line("Omar", "Can you Bcc every reply to our CRM?", 60, 63);
const SMALL_TALK = line("Omar", "The weather has been lovely this week.", 50, 53);

const TRIAGE_SPEND: Spend = { usd: 0.0002, tokens: 1_400, cachedTokens: 0 };

function harness(options: { verdict?: TriageVerdict | null; config?: Partial<ProactiveConfig>; spend?: Spend } = {}) {
  let busy = false;
  const triage = mock(
    async (_request: TriageRequest): Promise<TriageResult> => ({
      verdict: options.verdict === undefined ? { nudge: true, why: "Omar asked about Bcc" } : options.verdict,
      spend: options.spend ?? TRIAGE_SPEND,
    }),
  );
  const nudge = mock((_request: NudgeRequest) => true);
  const changed = mock();
  const proactive = new Proactive(
    { ...PROACTIVE_DEFAULTS, enabled: true, ...options.config },
    { triage, nudge, busy: () => busy, context: () => "Weekly sync · with Omar", changed },
  );
  let lines: TranscriptLine[] = [];
  let pending = "";
  const observe = () => proactive.observe({ lines, pending, live: true, selfName: "Ahmad Falta" });
  return {
    proactive,
    triage,
    nudge,
    changed,
    setBusy: (value: boolean) => {
      busy = value;
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

describe("Proactive: hit → triage → nudge", () => {
  test("a question waits for the pause, then one triage with the window decides a nudge with the new lines", async () => {
    const coach = harness();
    coach.say(SMALL_TALK, QUESTION);
    coach.tick(2);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.tick(1);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.triage.mock.calls[0]?.[0]).toEqual({
      context: "Weekly sync · with Omar",
      kinds: ["question"],
      lines: [SMALL_TALK, QUESTION],
    });
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    const request = coach.nudge.mock.calls[0]?.[0];
    expect(request?.why).toBe("Omar asked about Bcc");
    expect(request?.hits.map((hit) => hit.kind)).toEqual(["question"]);
    expect(request?.lines).toEqual([SMALL_TALK, QUESTION]);
  });

  test.each([
    ["triage says no", { nudge: false, why: "rhetorical" }],
    ["triage reply was malformed", null],
  ])("%s: triage runs, no coach turn starts", async (_, verdict) => {
    const coach = harness({ verdict });
    coach.say(QUESTION);
    coach.tick(3);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.nudge).not.toHaveBeenCalled();
  });

  test("small talk alone never reaches triage, the same meeting's question does", async () => {
    const coach = harness();
    coach.say(SMALL_TALK);
    coach.tick(5);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("the window sent to triage is the last 90 seconds only", () => {
    const coach = harness();
    const early = line("Omar", "Early chatter about the agenda.", 0, 4);
    const late = line("Omar", "Do you support SSO with Okta?", 200, 203);
    coach.say(early, late);
    coach.tick(3);
    expect(coach.triage.mock.calls[0]?.[0].lines).toEqual([late]);
  });
});

describe("Proactive: debounce and cooldown", () => {
  test("ongoing speech holds the triage, but never past the max hold", () => {
    const coach = harness();
    coach.say(QUESTION, line("You", "Hmm, let me think about that one.", 64, 66));
    for (let second = 1; second <= 8; second += 1) {
      coach.speaking(`and the other thing ${second}`);
      coach.tick(1);
    }
    expect(coach.triage).not.toHaveBeenCalled();
    coach.speaking("and the other thing 9");
    coach.tick(1);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("hits right after a nudge wait out the cooldown and are coalesced into one triage", async () => {
    const coach = harness();
    coach.say(QUESTION);
    coach.tick(3);
    await settle();
    expect(coach.nudge).toHaveBeenCalledTimes(1);
    coach.say(line("Omar", "Can you send the pricing sheet?", 80, 82), line("Omar", "It is $1,200 a month.", 83, 85));
    coach.tick(55);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    coach.tick(5);
    expect(coach.triage).toHaveBeenCalledTimes(2);
    expect(coach.triage.mock.calls[1]?.[0].kinds).toEqual(["question", "number"]);
  });

  test("nothing is triaged while a turn is running; the held hit goes once it ends", () => {
    const coach = harness();
    coach.setBusy(true);
    coach.say(QUESTION);
    coach.tick(10);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.setBusy(false);
    coach.tick(1);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("a held hit expires after the window instead of firing about a moment long gone", () => {
    const coach = harness();
    coach.setBusy(true);
    coach.say(QUESTION);
    coach.tick(95);
    coach.setBusy(false);
    coach.tick(3);
    expect(coach.triage).not.toHaveBeenCalled();
    coach.say(line("Omar", "Do you have the numbers?", 170, 172));
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
  });

  test("a busy turn that starts while triage runs drops the nudge", async () => {
    const coach = harness();
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    coach.setBusy(true);
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
  });
});

describe("Proactive: rate limit", () => {
  const askEvery70s = async (coach: ReturnType<typeof harness>, from: number, count: number) => {
    for (let index = 0; index < count; index += 1) {
      const at = (from + index) * 70;
      coach.say(line("Omar", `Can you check item ${from + index} for us?`, at, at + 3));
      coach.tick(3);
      await settle();
      coach.tick(67);
    }
  };

  test("at most 4 nudges in any 10 minutes, though triage says yes to a question every 70 seconds", async () => {
    const coach = harness();
    await askEvery70s(coach, 0, 8);
    expect(coach.triage).toHaveBeenCalledTimes(4);
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
  test("triage and nudges count toward the cap; asks only toward the meeting total", async () => {
    const coach = harness();
    coach.say(QUESTION);
    coach.tick(3);
    await settle();
    coach.proactive.spend("nudges", { usd: 0.0098, tokens: 3_100, cachedTokens: 0 });
    coach.proactive.spend("asks", { usd: 0.05, tokens: 40_000, cachedTokens: 35_000 });
    const view = coach.proactive.view();
    expect(view.nudgesUsd).toBeCloseTo(0.01, 6);
    expect(view.meetingUsd).toBeCloseTo(0.06, 6);
    expect(view).toMatchObject({ state: "on", capUsd: 0.5, meetingTokens: 44_500, cachedTokens: 35_000 });
    expect(coach.changed).toHaveBeenLastCalledWith(coach.proactive.view());
  });

  test("cache reads alone can reach the cap: 250k cached Sonnet tokens are $0.05", async () => {
    const cached = (tokens: number) =>
      spendOf("sonnet", { inputTokens: 0, cachedInputTokens: tokens, cacheCreationTokens: 0, outputTokens: 0 });
    const coach = harness({ config: { capUsd: 0.05 }, spend: { usd: 0, tokens: 0, cachedTokens: 0 } });
    coach.proactive.spend("nudges", cached(249_000));
    coach.say(QUESTION);
    coach.tick(3);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);

    coach.proactive.spend("nudges", cached(1_000));
    coach.say(line("Omar", "Do you have the numbers?", 170, 172));
    coach.tick(80);
    await settle();
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.proactive.view().state).toBe("capped");
  });

  test("asks never pause nudges, however much they cost", () => {
    const coach = harness({ config: { capUsd: 0.05 } });
    coach.proactive.spend("asks", { usd: 3, tokens: 1_000_000, cachedTokens: 900_000 });
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    expect(coach.proactive.view().state).toBe("on");
  });

  test("once the cap is reached no triage call is made and the view says capped", () => {
    const open = harness();
    open.say(QUESTION);
    open.tick(3);
    expect(open.triage).toHaveBeenCalledTimes(1);

    const capped = harness({ config: { capUsd: 0.05 } });
    capped.proactive.spend("nudges", { usd: 0.05, tokens: 9_000, cachedTokens: 0 });
    capped.say(QUESTION);
    capped.tick(3);
    expect(capped.triage).not.toHaveBeenCalled();
    expect(capped.proactive.view().state).toBe("capped");
  });

  test("triage that pushes the total over the cap does not start the nudge", async () => {
    const coach = harness({ spend: { usd: 0.006, tokens: 1_400, cachedTokens: 0 }, config: { capUsd: 0.01 } });
    coach.proactive.spend("nudges", { usd: 0.005, tokens: 1_000, cachedTokens: 0 });
    coach.say(QUESTION);
    coach.tick(3);
    expect(coach.triage).toHaveBeenCalledTimes(1);
    await settle();
    expect(coach.nudge).not.toHaveBeenCalled();
    expect(coach.proactive.view().state).toBe("capped");
  });

  test("turned off: never triages, though the same lines would", () => {
    const on = harness();
    on.say(QUESTION);
    on.tick(3);
    expect(on.triage).toHaveBeenCalledTimes(1);

    const off = harness({ config: { enabled: false } });
    off.say(QUESTION);
    off.tick(3);
    expect(off.triage).not.toHaveBeenCalled();
    expect(off.proactive.view().state).toBe("off");
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
      coach.say(QUESTION);
      coach.tick(3);
      await settle();
      expect(coach.nudge).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      coach.say(line("Omar", "Could you also check the Zendesk sync?", 120, 123));
      coach.tick(20);
      await settle();
      expect(coach.triage).toHaveBeenCalledTimes(2);
      expect(coach.nudge).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
