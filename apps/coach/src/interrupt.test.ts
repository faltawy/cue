import { describe, expect, test } from "bun:test";

import { createInterrupter, INTERRUPT_GRACE_MS } from "./interrupt";

function fakeClock() {
  let now = 0;
  const timers: Array<{ at: number; run: () => void; cancelled: boolean }> = [];
  return {
    schedule(run: () => void, ms: number) {
      const timer = { at: now + ms, run, cancelled: false };
      timers.push(timer);
      return { cancel: () => (timer.cancelled = true) };
    },
    advance(ms: number) {
      now += ms;
      for (const timer of timers) {
        if (!timer.cancelled && timer.at <= now) {
          timer.cancelled = true;
          timer.run();
        }
      }
    },
  };
}

function setup(interrupt: () => Promise<unknown> = () => new Promise(() => {})) {
  const clock = fakeClock();
  const calls = { interrupt: 0, abort: 0 };
  const interrupter = createInterrupter({
    interrupt: () => {
      calls.interrupt += 1;
      return interrupt();
    },
    abort: () => (calls.abort += 1),
    schedule: clock.schedule,
  });
  return { clock, calls, interrupter };
}

describe("createInterrupter", () => {
  test("asks Claude Code to stop, and aborts it only if the turn hasn't ended after the grace period", () => {
    const { clock, calls, interrupter } = setup();
    interrupter.request();
    expect(calls).toEqual({ interrupt: 1, abort: 0 });
    clock.advance(INTERRUPT_GRACE_MS - 1);
    expect(calls.abort).toBe(0);
    clock.advance(1);
    expect(calls.abort).toBe(1);
    expect(interrupter.pending).toBe(false);
  });

  test("a turn that ends within the grace period is never aborted", () => {
    const { clock, calls, interrupter } = setup();
    interrupter.request();
    clock.advance(1_000);
    interrupter.settled();
    clock.advance(INTERRUPT_GRACE_MS * 2);
    expect(calls).toEqual({ interrupt: 1, abort: 0 });
  });

  test("a second Stop while waiting doesn't interrupt twice", () => {
    const { calls, interrupter } = setup();
    interrupter.request();
    interrupter.request();
    expect(calls.interrupt).toBe(1);
  });

  test("aborts at once when the interrupt itself fails", async () => {
    const { calls, interrupter } = setup(() => Promise.reject(new Error("transport closed")));
    interrupter.request();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.abort).toBe(1);
  });
});
