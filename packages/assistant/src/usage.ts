export type TurnUsage = {
  model: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  cacheWrite5mTokens?: number;
  outputTokens: number;
  costUsd: number | null;
  contextTokens: number | null;
  contextWindow: number | null;
};

function count(record: unknown, key: string): number {
  if (!record || typeof record !== "object" || !(key in record)) return 0;
  const value: unknown = Reflect.get(record, key);
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

export function cacheWrite5m(usage: unknown): number {
  if (!usage || typeof usage !== "object") return 0;
  return count(
    Reflect.get(usage, "cache_creation"),
    "ephemeral_5m_input_tokens",
  );
}

export type UsageSource = {
  usage: unknown;
  modelUsage?: Record<string, unknown>;
  total_cost_usd: number;
};

export function turnUsage(input: {
  result: UsageSource;
  lastMainUsage: unknown;
}): TurnUsage | null {
  const { result } = input;
  let model: string | null = null;
  let contextWindow: number | null = null;
  let dominant = -1;
  for (const [name, entry] of Object.entries(result.modelUsage ?? {})) {
    const tokens =
      count(entry, "inputTokens") +
      count(entry, "cacheReadInputTokens") +
      count(entry, "outputTokens");
    if (tokens > dominant) {
      dominant = tokens;
      model = name;
      const window = count(entry, "contextWindow");
      contextWindow = window > 0 ? window : null;
    }
  }

  let contextTokens: number | null = null;
  const last = input.lastMainUsage;
  if (last && typeof last === "object") {
    const iterations: unknown = Reflect.get(last, "iterations");
    const current =
      Array.isArray(iterations) && iterations.length > 0
        ? iterations[iterations.length - 1]
        : last;
    const occupancy =
      count(current, "input_tokens") +
      count(current, "cache_read_input_tokens") +
      count(current, "cache_creation_input_tokens");
    contextTokens = occupancy > 0 ? occupancy : null;
  }

  const costUsd =
    Number.isFinite(result.total_cost_usd) && result.total_cost_usd > 0
      ? result.total_cost_usd
      : null;
  const usage: TurnUsage = {
    model,
    inputTokens: count(result.usage, "input_tokens"),
    cachedInputTokens: count(result.usage, "cache_read_input_tokens"),
    cacheCreationTokens: count(result.usage, "cache_creation_input_tokens"),
    cacheWrite5mTokens: cacheWrite5m(result.usage),
    outputTokens: count(result.usage, "output_tokens"),
    costUsd,
    contextTokens,
    contextWindow,
  };
  const tokens =
    usage.inputTokens +
    usage.cachedInputTokens +
    usage.cacheCreationTokens +
    usage.outputTokens;
  return tokens > 0 || costUsd !== null || contextTokens !== null
    ? usage
    : null;
}

export function formatTokens(tokens: number): string {
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000)
    return `${(tokens / 1_000).toFixed(tokens < 10_000 ? 1 : 0)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}
