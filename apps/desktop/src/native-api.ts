import {
  invoke as nativeInvoke,
  type InvokeArgs,
  type InvokeOptions,
} from "@tauri-apps/api/core";
export * from "@tauri-apps/api/core";

const windowRun = crypto.randomUUID();
let sequence = 0;
const frequentCommands = new Set([
  "plugin:dictation|update_amplitude",
  "plugin:dictation|set_preview",
  "plugin:event|emit",
  "plugin:event|emit_to",
]);
const summaries = new Map<
  string,
  { count: number; totalMs: number; maxMs: number }
>();
let summaryTimer: ReturnType<typeof setTimeout> | undefined;

function summarize(command: string, durationMs: number) {
  const entry = summaries.get(command) ?? { count: 0, totalMs: 0, maxMs: 0 };
  entry.count++;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  summaries.set(command, entry);
  summaryTimer ??= setTimeout(() => {
    for (const [command, metrics] of summaries) {
      console.info("[native] activity", { windowRun, command, ...metrics });
    }
    summaries.clear();
    summaryTimer = undefined;
  }, 30_000);
}

// The Vite resolver routes native callers here but leaves this module's own
// import untouched. Arguments/results may contain notes, tokens, or audio.
export async function invoke<T>(
  command: string,
  args?: InvokeArgs,
  options?: InvokeOptions,
): Promise<T> {
  if (command.startsWith("plugin:tracing|"))
    return nativeInvoke<T>(command, args, options);
  const operationId = `${windowRun}:${++sequence}`;
  const started = performance.now();
  const frequent = frequentCommands.has(command);
  const context = { command, operationId };
  if (!frequent) console.info("[native] started", context);
  const pending = setTimeout(
    () =>
      console.warn("[native] still pending", {
        ...context,
        durationMs: Math.round(performance.now() - started),
      }),
    10_000,
  );
  try {
    const result = await nativeInvoke<T>(command, args, options);
    const durationMs = Math.round(performance.now() - started);
    if (frequent) summarize(command, durationMs);
    else console.info("[native] completed", { ...context, durationMs });
    return result;
  } catch (error) {
    // Native errors can embed provider responses or SQL values. Keep the
    // boundary record content-free; domain logs provide safe error codes.
    console.error("[native] failed", {
      ...context,
      durationMs: Math.round(performance.now() - started),
      errorType: error instanceof Error ? error.name : typeof error,
    });
    throw error;
  } finally {
    clearTimeout(pending);
  }
}
