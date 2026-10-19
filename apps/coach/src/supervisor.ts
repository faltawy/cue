const MISSING = /^(?:Claude Code returned an error result: )?No conversation found with session ID: ([\w-]+)$/;

export function missingConversation(text: string): string | null {
  return MISSING.exec(text.trim())?.[1] ?? null;
}

export type RestartPolicy = { maxFailures: number; baseMs: number; capMs: number };

export const RESTART: RestartPolicy = { maxFailures: 5, baseMs: 2_000, capMs: 30_000 };

export type Restart = { kind: "now" } | { kind: "later"; delayMs: number } | { kind: "stop" };

export function restartAfter(failures: number, policy: RestartPolicy = RESTART): Restart {
  if (failures >= policy.maxFailures) return { kind: "stop" };
  if (failures <= 1) return { kind: "now" };
  return { kind: "later", delayMs: Math.min(policy.capMs, policy.baseMs * 2 ** (failures - 2)) };
}

export type SupervisorDeps<M> = {
  handle(message: M): void;
  ended(ours: boolean): void;
  failed(message: string): void;
  gaveUp(message: string): void;
  forget(id: string): void;
  restart(): void;
  schedule(run: () => void, delayMs: number): () => void;
};

function resultErrors(message: unknown): string[] {
  if (typeof message !== "object" || message === null) return [];
  const record = Object.fromEntries(Object.entries(message));
  if (record.type !== "result" || !Array.isArray(record.errors)) return [];
  return record.errors.filter((entry): entry is string => typeof entry === "string");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class Supervisor<M> {
  private generation = 0;
  private failures = 0;
  private abortRequested = false;
  private cancelPending: (() => void) | null = null;

  constructor(
    private readonly deps: SupervisorDeps<M>,
    private readonly policy: RestartPolicy = RESTART,
  ) {}

  reset() {
    this.failures = 0;
  }

  aborting() {
    this.abortRequested = true;
  }

  stop() {
    this.generation += 1;
    this.abortRequested = false;
    this.cancelPending?.();
    this.cancelPending = null;
  }

  watch(session: { messages: AsyncIterable<M> }, resumedFrom: string | null) {
    this.stop();
    const mine = this.generation;
    void (async () => {
      let failure: string | null = null;
      let missing = false;
      try {
        for await (const message of session.messages) {
          if (mine !== this.generation) return;
          if (resumedFrom && resultErrors(message).some((error) => missingConversation(error) === resumedFrom)) {
            missing = true;
            continue;
          }
          this.deps.handle(message);
        }
      } catch (error) {
        failure = errorText(error);
      }
      if (mine !== this.generation) return;
      this.settle({ failure, missing: missing || (resumedFrom !== null && failure !== null && missingConversation(failure) === resumedFrom), resumedFrom });
    })();
  }

  private settle(input: { failure: string | null; missing: boolean; resumedFrom: string | null }) {
    const ours = this.abortRequested;
    this.abortRequested = false;
    this.deps.ended(ours);
    if (ours) {
      this.deps.restart();
      return;
    }
    this.failures += 1;
    if (input.missing && input.resumedFrom) {
      this.deps.forget(input.resumedFrom);
      this.deps.restart();
      return;
    }
    const message = input.failure ?? "Claude Code exited unexpectedly.";
    const next = restartAfter(this.failures, this.policy);
    if (next.kind === "stop") {
      this.deps.gaveUp(message);
      return;
    }
    this.deps.failed(message);
    if (next.kind === "now") {
      this.deps.restart();
      return;
    }
    const mine = this.generation;
    this.cancelPending = this.deps.schedule(() => {
      this.cancelPending = null;
      if (mine === this.generation) this.deps.restart();
    }, next.delayMs);
  }
}
