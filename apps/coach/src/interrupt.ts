// Interrupt with a grace period, then abort, as Catamorphic's packages/claude-code/src/adapter.ts does (Apache-2.0, see NOTICE).

export const INTERRUPT_GRACE_MS = 5_000;

type Timer = { cancel(): void };

export type Interrupter = {
  request(): void;
  settled(): void;
  readonly pending: boolean;
};

export function createInterrupter(input: {
  interrupt(): Promise<unknown>;
  abort(): void;
  graceMs?: number;
  schedule?: (run: () => void, ms: number) => Timer;
}): Interrupter {
  const schedule =
    input.schedule ??
    ((run, ms) => {
      const handle = setTimeout(run, ms);
      return { cancel: () => clearTimeout(handle) };
    });
  let timer: Timer | null = null;
  let aborted = false;

  const abort = () => {
    if (aborted) return;
    aborted = true;
    timer?.cancel();
    timer = null;
    input.abort();
  };

  return {
    request() {
      if (timer || aborted) return;
      timer = schedule(abort, input.graceMs ?? INTERRUPT_GRACE_MS);
      input.interrupt().catch(abort);
    },
    settled() {
      timer?.cancel();
      timer = null;
    },
    get pending() {
      return timer !== null;
    },
  };
}
