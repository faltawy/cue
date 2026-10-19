import { describe, expect, test } from "bun:test";

import { formatTokens, turnUsage } from "./usage";

const modelEntry = (inputTokens: number, outputTokens: number, contextWindow: number) => ({
  inputTokens,
  outputTokens,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  webSearchRequests: 0,
  costUSD: 0,
  contextWindow,
  maxOutputTokens: 0,
});

const usageOf = (input: number, cacheRead: number, cacheCreate: number, output: number) => ({
  input_tokens: input,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheCreate,
  output_tokens: output,
});

describe("turnUsage", () => {
  test("totals come from the result; context is the last main-thread call's input side; the busiest model names the window", () => {
    const usage = turnUsage({
      result: {
        usage: {
          ...usageOf(1_200, 30_000, 500, 400),
          cache_creation: { ephemeral_5m_input_tokens: 200, ephemeral_1h_input_tokens: 300 },
        },
        modelUsage: {
          "claude-haiku": modelEntry(100, 20, 200_000),
          "claude-sonnet": modelEntry(1_100, 380, 1_000_000),
        },
        total_cost_usd: 0.0123,
      },
      lastMainUsage: { iterations: [usageOf(10, 0, 0, 5), usageOf(900, 41_000, 100, 60)] },
    });
    expect(usage).toEqual({
      model: "claude-sonnet",
      inputTokens: 1_200,
      cachedInputTokens: 30_000,
      cacheCreationTokens: 500,
      cacheWrite5mTokens: 200,
      outputTokens: 400,
      costUsd: 0.0123,
      contextTokens: 42_000,
      contextWindow: 1_000_000,
    });
  });

  test("a turn that used nothing reports nothing", () => {
    expect(turnUsage({ result: { usage: usageOf(0, 0, 0, 0), modelUsage: {}, total_cost_usd: 0 }, lastMainUsage: undefined })).toBeNull();
    expect(
      turnUsage({ result: { usage: usageOf(3, 0, 0, 1), modelUsage: {}, total_cost_usd: 0 }, lastMainUsage: undefined }),
    ).not.toBeNull();
  });
});

test("formatTokens", () => {
  expect([formatTokens(950), formatTokens(4_321), formatTokens(42_000), formatTokens(1_500_000)]).toEqual([
    "950",
    "4.3k",
    "42k",
    "1.5M",
  ]);
});
