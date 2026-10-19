import type { TurnUsage } from "./usage";

export type TokenUsage = Pick<TurnUsage, "inputTokens" | "cachedInputTokens" | "cacheCreationTokens" | "outputTokens"> & {
  cacheWrite5mTokens?: number;
};

type Price = { input: number; output: number; cacheRead: number };

// Published list prices in USD per million tokens for the models behind the Claude Code aliases
// (sonnet → claude-sonnet-5-5, haiku → claude-haiku-5-5, opus → claude-opus-5-5), checked 2026-10-19.
const PRICES = {
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01 },
  sonnet: { input: 2, output: 10, cacheRead: 0.2 },
  opus: { input: 4, output: 20, cacheRead: 0.2 },
} satisfies Record<string, Price>;

const CACHE_WRITE_5M = 1.25;
// Claude Code writes the cache with the 1-hour TTL for Claude sign-ins, so a write with no TTL split is priced as 1-hour.
const CACHE_WRITE_1H = 2;

function priceOf(model: string): Price {
  const name = model.toLowerCase();
  if (name.includes("haiku")) return PRICES.haiku;
  if (name.includes("sonnet")) return PRICES.sonnet;
  return PRICES.opus;
}

export function costUsd(model: string, usage: TokenUsage): number {
  const price = priceOf(model);
  const write5m = Math.min(usage.cacheWrite5mTokens ?? 0, usage.cacheCreationTokens);
  const write1h = usage.cacheCreationTokens - write5m;
  const perMillion =
    usage.inputTokens * price.input +
    usage.cachedInputTokens * price.cacheRead +
    write5m * price.input * CACHE_WRITE_5M +
    write1h * price.input * CACHE_WRITE_1H +
    usage.outputTokens * price.output;
  return perMillion / 1_000_000;
}

export type Spend = { usd: number; tokens: number; cachedTokens: number };

export const NO_SPEND: Spend = { usd: 0, tokens: 0, cachedTokens: 0 };

export function spendOf(model: string, usage: TokenUsage): Spend {
  return {
    usd: costUsd(model, usage),
    tokens: usage.inputTokens + usage.cachedInputTokens + usage.cacheCreationTokens + usage.outputTokens,
    cachedTokens: usage.cachedInputTokens,
  };
}

// Rough count without a tokenizer: ~4 characters per token for Latin script, ~2.5 for Arabic.
export function charTokens(char: string): number {
  return /[؀-ۿ]/.test(char) ? 1 / 2.5 : 1 / 4;
}

export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) tokens += charTokens(char);
  return Math.ceil(tokens);
}

// What Claude Code adds around a one-shot prompt with no tools: a Sonnet nudge with ~363 estimated tokens of ours
// billed 1,050 input tokens (measured 2026-10-19).
export const ONE_SHOT_OVERHEAD_TOKENS = 690;

export function formatUsd(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

export function approxUsd(usd: number): string {
  return usd > 0 && usd < 0.01 ? "<$0.01" : `≈${formatUsd(usd)}`;
}
