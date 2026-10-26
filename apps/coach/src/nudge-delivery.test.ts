import { expect, test } from "bun:test";

import { type Move, MoveTag, MoveVerb } from "@anlg/assistant/move";
import { NO_SPEND } from "@anlg/assistant/pricing";

import { type NudgeResult } from "./nudge";
import { deliverNudge } from "./nudge-delivery";
import { NudgeOutcome } from "./nudge-outcome";

const move: Move = {
  tag: MoveTag.DecisionOwner,
  headline: "Confirm the owner",
  verb: MoveVerb.Ask,
  line: "Who will own the next step?",
};

test("background generation publishes only a completed current suggestion and stays silent when the user takes over", async () => {
  const shown: string[] = [];
  const deferred: string[] = [];
  let resolve!: (result: NudgeResult) => void;
  let current = true;
  let opening = true;
  const controller = new AbortController();
  const deps = {
    signal: controller.signal,
    current: () => current,
    canDeliver: () => opening,
    publish: (value: Move) => shown.push(value.line),
    defer: (note: string) => deferred.push(note),
  };
  const first = deliverNudge(
    () =>
      new Promise<NudgeResult>((done) => {
        resolve = done;
      }),
    deps,
  );
  expect(shown).toEqual([]);
  const result: NudgeResult = { ok: true, move, talk: null, spend: NO_SPEND };
  resolve(result);
  expect((await first).outcome).toBe(NudgeOutcome.Nudge);
  expect(shown).toEqual(["Who will own the next step?"]);

  opening = false;
  expect((await deliverNudge(async () => result, deps)).outcome).toBe(
    NudgeOutcome.Suppressed,
  );
  expect(shown).toEqual(["Who will own the next step?"]);
  current = false;
  expect((await deliverNudge(async () => result, deps)).outcome).toBe(
    NudgeOutcome.Suppressed,
  );
  current = true;
  expect(
    (
      await deliverNudge(
        async () => ({
          ...result,
          move: null,
          deferred: "Confirm the rollout owner after the call.",
        }),
        deps,
      )
    ).outcome,
  ).toBe(NudgeOutcome.Later);
  expect(deferred).toEqual(["Confirm the rollout owner after the call."]);
  controller.abort();
  expect((await deliverNudge(async () => result, deps)).outcome).toBe(
    NudgeOutcome.Suppressed,
  );
  expect(shown).toEqual(["Who will own the next step?"]);
});
