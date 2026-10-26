import { describe, expect, test } from "bun:test";

import { costUsd } from "@anlg/assistant/pricing";

const usage = (fields: Partial<Parameters<typeof costUsd>[1]> = {}) => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  outputTokens: 0,
  ...fields,
});

describe("costUsd", () => {
  test("a nudge in the main chat: 35k cache reads are billed at a tenth of input, not free", () => {
    expect(
      costUsd("claude-sonnet-5-5", usage({ cachedInputTokens: 35_000 })),
    ).toBeCloseTo(0.007, 6);
    expect(
      costUsd(
        "sonnet",
        usage({
          cachedInputTokens: 35_000,
          inputTokens: 1_000,
          outputTokens: 250,
        }),
      ),
    ).toBeCloseTo(0.007 + 0.002 + 0.0025, 6);
  });

  test("cache writes cost 1.25x input for the 5-minute part and 2x for the rest, which is the 1-hour default", () => {
    expect(
      costUsd(
        "sonnet",
        usage({ cacheCreationTokens: 10_000, cacheWrite5mTokens: 10_000 }),
      ),
    ).toBeCloseTo(0.025, 6);
    expect(
      costUsd("sonnet", usage({ cacheCreationTokens: 10_000 })),
    ).toBeCloseTo(0.04, 6);
    expect(
      costUsd(
        "sonnet",
        usage({ cacheCreationTokens: 10_000, cacheWrite5mTokens: 4_000 }),
      ),
    ).toBeCloseTo(0.01 + 0.024, 6);
  });

  test("each model family has its own prices, matched from aliases and full ids", () => {
    const call = usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(costUsd("haiku", call)).toBeCloseTo(0.6, 6);
    expect(costUsd("claude-haiku-5-5", call)).toBeCloseTo(0.6, 6);
    expect(costUsd("claude-opus-5-5[1m]", call)).toBeCloseTo(24, 6);
    expect(
      costUsd("opus", usage({ cachedInputTokens: 1_000_000 })),
    ).toBeCloseTo(0.2, 6);
  });

  test("Codex estimates include cached reads and conservatively price long context", () => {
    expect(
      costUsd(
        "gpt-6.1-sol",
        usage({
          inputTokens: 1_000,
          cachedInputTokens: 2_000,
          outputTokens: 500,
        }),
      ),
    ).toBeCloseTo(0.0072, 6);
    expect(
      costUsd(
        "gpt-6.1-sol",
        usage({
          inputTokens: 300_000,
          cachedInputTokens: 100_000,
          outputTokens: 1_000,
        }),
      ),
    ).toBeCloseTo(1.235, 6);
  });

  test("unknown pricing is explicit rather than charging an unrelated provider rate", () => {
    expect(
      costUsd(
        "gpt-5.3-codex",
        usage({
          inputTokens: 1_000,
          cachedInputTokens: 2_000,
          outputTokens: 500,
        }),
      ),
    ).toBeCloseTo(0.0091, 6);
    expect(
      costUsd("some-future-model", usage({ inputTokens: 1_000 })),
    ).toBeNull();
  });
});
