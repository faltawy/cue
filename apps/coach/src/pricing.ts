import type { TurnUsage } from "./usage";

export type TokenUsage = Pick<
  TurnUsage,
  "inputTokens" | "cachedInputTokens" | "cacheCreationTokens" | "outputTokens"
> & {
  cacheWrite5mTokens?: number;
};

type Price = {
  input: number;
  output: number;
  cacheRead: number;
  longContext?: boolean;
};

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

// Standard API-equivalent estimates, not a ChatGPT subscription invoice.
// https://developers.openai.com/api/docs/pricing (checked 2026-10-21).
const CODEX_PRICES: Record<string, Price> = {
  "gpt-5.3-codex": { input: 1.75, output: 14, cacheRead: 0.175 },
  "gpt-5.4": { input: 2.5, output: 15, cacheRead: 0.25, longContext: true },
  "gpt-5.6-sol": { input: 4, output: 20, cacheRead: 0.4, longContext: true },
  "gpt-6-sol": { input: 2, output: 10, cacheRead: 0.2, longContext: true },
  "gpt-6.1-sol": { input: 2, output: 10, cacheRead: 0.1, longContext: true },
  "gpt-6-astra": { input: 10, output: 50, cacheRead: 1, longContext: true },
  "gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, longContext: true },
};

function priceOf(model: string): Price | null {
  const name = model.toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (name === "haiku" || name.startsWith("claude-haiku-")) return PRICES.haiku;
  if (name === "sonnet" || name.startsWith("claude-sonnet-"))
    return PRICES.sonnet;
  if (name === "opus" || name.startsWith("claude-opus-")) return PRICES.opus;
  return Object.hasOwn(CODEX_PRICES, name) ? CODEX_PRICES[name]! : null;
}

export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = priceOf(model);
  if (!price) return null;
  if (model.toLowerCase().startsWith("gpt-")) {
    // Codex reports aggregate turn usage, so apply the higher rate conservatively
    // when those tokens could include a long-context request. Cache writes are not charged by Codex.
    const long =
      price.longContext &&
      usage.inputTokens + usage.cachedInputTokens > 272_000;
    return (
      ((usage.inputTokens * price.input +
        usage.cachedInputTokens * price.cacheRead) *
        (long ? 2 : 1) +
        usage.outputTokens * price.output * (long ? 1.5 : 1)) /
      1_000_000
    );
  }
  const write5m = Math.min(
    usage.cacheWrite5mTokens ?? 0,
    usage.cacheCreationTokens,
  );
  const write1h = usage.cacheCreationTokens - write5m;
  const perMillion =
    usage.inputTokens * price.input +
    usage.cachedInputTokens * price.cacheRead +
    write5m * price.input * CACHE_WRITE_5M +
    write1h * price.input * CACHE_WRITE_1H +
    usage.outputTokens * price.output;
  return perMillion / 1_000_000;
}

export type Spend = {
  usd: number | null;
  tokens: number;
  cachedTokens: number;
};

export const NO_SPEND: Spend = { usd: 0, tokens: 0, cachedTokens: 0 };

export function spendOf(model: string, usage: TokenUsage): Spend {
  return {
    usd: costUsd(model, usage),
    tokens:
      usage.inputTokens +
      usage.cachedInputTokens +
      usage.cacheCreationTokens +
      usage.outputTokens,
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

export function approxUsd(usd: number | null): string {
  if (usd === null) return "Cost unavailable";
  return usd > 0 && usd < 0.01 ? "<$0.01" : `≈${formatUsd(usd)}`;
}
