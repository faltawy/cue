import { describe, expect, test } from "bun:test";

import {
  missingConversation,
  MissingConversationError,
  restartAfter,
  RestartKind,
  Supervisor,
} from "./supervisor";

const STALE = "b1c9030e-9876-433f-a1b8-2b9a7856876d";

const missingResult = {
  type: "result",
  subtype: "error_during_execution",
  is_error: true,
  errors: [`No conversation found with session ID: ${STALE}`],
  session_id: "4f1d2c3b-0000-4000-8000-000000000000",
};

type Step = { message: unknown } | { fail: string | Error } | { hang: true };

function fakeSession(steps: Step[]) {
  return {
    messages: (async function* () {
      for (const step of steps) {
        if ("message" in step) yield step.message;
        else if ("fail" in step)
          throw typeof step.fail === "string"
            ? new Error(step.fail)
            : step.fail;
        else await new Promise(() => {});
      }
    })(),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

function harness(
  sessionFor: (resume: string | null, attempt: number) => Step[],
) {
  let stored: string | null = STALE;
  const starts: Array<string | null> = [];
  const handled: unknown[] = [];
  const cards: string[] = [];
  const gaveUp: string[] = [];
  const forgotten: string[] = [];
  const ended: boolean[] = [];
  const timers: Array<{ run: () => void; delayMs: number }> = [];
  const supervisor: Supervisor<unknown> = new Supervisor<unknown>({
    handle: (message) => {
      handled.push(message);
      const record = message as { type?: string; is_error?: boolean };
      if (record.type === "result" && record.is_error === false)
        supervisor.reset();
    },
    ended: (ours) => ended.push(ours),
    failed: (message) => cards.push(message),
    gaveUp: (message) => gaveUp.push(message),
    forget: (id) => {
      forgotten.push(id);
      stored = null;
    },
    restart: () => open(),
    schedule: (run, delayMs) => {
      timers.push({ run, delayMs });
      return () => {};
    },
  });
  function open() {
    const resume = stored;
    starts.push(resume);
    supervisor.watch(fakeSession(sessionFor(resume, starts.length)), resume);
  }
  return {
    open,
    supervisor,
    starts,
    handled,
    cards,
    gaveUp,
    forgotten,
    ended,
    timers,
  };
}

describe("missingConversation", () => {
  test("reads the session id from Claude Code's result error and from the SDK's thrown error", () => {
    expect(
      missingConversation(`No conversation found with session ID: ${STALE}`),
    ).toBe(STALE);
    expect(
      missingConversation(
        `Claude Code returned an error result: No conversation found with session ID: ${STALE}`,
      ),
    ).toBe(STALE);
  });

  test("ignores other errors and the phrase inside a longer message", () => {
    expect(
      missingConversation("Claude Code returned an error result: Overloaded"),
    ).toBeNull();
    expect(
      missingConversation(
        `The user said "No conversation found with session ID: ${STALE}" in the meeting`,
      ),
    ).toBeNull();
  });
});

describe("restartAfter", () => {
  test("one immediate retry, then doubling waits up to the cap, then stop", () => {
    expect([1, 2, 3, 4, 5].map((failures) => restartAfter(failures))).toEqual([
      { kind: RestartKind.Now },
      { kind: RestartKind.Later, delayMs: 2_000 },
      { kind: RestartKind.Later, delayMs: 4_000 },
      { kind: RestartKind.Later, delayMs: 8_000 },
      { kind: RestartKind.Stop },
    ]);
    expect(
      restartAfter(9, { maxFailures: 20, baseMs: 2_000, capMs: 30_000 }),
    ).toEqual({ kind: RestartKind.Later, delayMs: 30_000 });
  });
});

describe("the session supervisor", () => {
  test("a missing provider conversation restarts fresh and delivers subsequent messages", async () => {
    const recovered = { type: "text", text: "Recovered conversation" };
    const run = harness((resume) =>
      resume === STALE
        ? [{ fail: new MissingConversationError(STALE) }]
        : [{ message: recovered }, { hang: true }],
    );
    run.open();
    await flush();
    await flush();
    expect(run.starts).toEqual([STALE, null]);
    expect(run.forgotten).toEqual([STALE]);
    expect(run.handled).toEqual([recovered]);
    expect(run.cards).toEqual([]);
  });

  test("a resume Claude Code can't find forgets the stored id and starts exactly one fresh session, with no error card", async () => {
    const run = harness((resume) =>
      resume === STALE
        ? [
            { message: missingResult },
            {
              fail: `Claude Code returned an error result: No conversation found with session ID: ${STALE}`,
            },
          ]
        : [{ hang: true }],
    );
    run.open();
    await flush();
    await flush();
    expect(run.starts).toEqual([STALE, null]);
    expect(run.forgotten).toEqual([STALE]);
    expect(run.cards).toEqual([]);
    expect(run.handled).toEqual([]);
    expect(run.timers).toEqual([]);
    expect(run.gaveUp).toEqual([]);
  });

  test("repeated failures back off and stop after the cap with one final card", async () => {
    const run = harness(() => [{ fail: "Claude Code exited unexpectedly." }]);
    run.open();
    await flush();
    expect(run.starts).toHaveLength(2);
    for (let wait = 0; wait < 10 && run.timers.length > 0; wait += 1) {
      const timer = run.timers.shift();
      timer?.run();
      await flush();
    }
    expect(run.starts).toHaveLength(5);
    expect(run.cards).toEqual(
      Array.from({ length: 4 }, () => "Claude Code exited unexpectedly."),
    );
    expect(run.gaveUp).toEqual(["Claude Code exited unexpectedly."]);
    expect(run.timers).toEqual([]);
    await flush();
    expect(run.starts).toHaveLength(5);
  });

  test("a turn that succeeds resets the count, so the next failure retries at once", async () => {
    const run = harness((_resume, attempt) =>
      attempt === 2
        ? [
            {
              message: { type: "result", subtype: "success", is_error: false },
            },
            { fail: "Claude Code exited unexpectedly." },
          ]
        : attempt <= 3
          ? [{ fail: "Claude Code exited unexpectedly." }]
          : [{ hang: true }],
    );
    run.open();
    await flush();
    await flush();
    await flush();
    expect(run.starts).toHaveLength(3);
    expect(run.timers).toEqual([{ run: expect.any(Function), delayMs: 2_000 }]);
  });

  test("a session replaced on purpose never restarts, and an abort the server asked for restarts without a card", async () => {
    const run = harness(() => [{ hang: true }]);
    const replaced = fakeSession([
      { fail: "Claude Code exited unexpectedly." },
    ]);
    run.supervisor.watch(replaced, null);
    run.supervisor.watch(fakeSession([{ hang: true }]), null);
    await flush();
    expect(run.cards).toEqual([]);
    expect(run.starts).toEqual([]);

    run.supervisor.watch(fakeSession([{ fail: "aborted" }]), null);
    run.supervisor.aborting();
    await flush();
    expect(run.cards).toEqual([]);
    expect(run.ended).toEqual([true]);
    expect(run.starts).toEqual([STALE]);
  });
});
