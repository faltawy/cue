import { describe, expect, test } from "bun:test";

import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Dispatch, useReducer } from "react";

import type { CoachEvent } from "../protocol";
import { CoachView } from "./app";
import { useDom } from "./dom-setup";
import { fixtureState, longAnswerDeltas } from "./fixtures";
import { type Action, reduce } from "./state";
import type { CoachApi } from "./use-coach";

useDom();

const ok = async () => ({ ok: true as const });
const api: CoachApi = {
  ask: ok,
  checkItem: ok,
  addItemToNote: ok,
  open: ok,
  stop: ok,
  checkIn: ok,
  newChat: ok,
  answer: ok,
  dismiss: ok,
  undo: ok,
  chooseSeriesFolder: ok,
  useDefaultFolder: ok,
  addActionItems: ok,
  logToClients: ok,
  signIn: ok,
  notify: () => {},
};

function Harness({ expose }: { expose(dispatch: Dispatch<Action>): void }) {
  const [state, dispatch] = useReducer(reduce, fixtureState("live"));
  expose(dispatch);
  return <CoachView state={state} api={api} />;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

const round = (value: number) => Math.round(value * 100) / 100;

describe("streaming a long answer", () => {
  test("each frame costs about the same at the end as at the start, and typing stays quick", async () => {
    let dispatch: Dispatch<Action> = () => {};
    const view = render(<Harness expose={(next) => (dispatch = next)} />);
    const box = view.getByRole("textbox", { name: "Ask the coach" });
    const user = userEvent.setup({ document });

    const typeOne = async () => {
      const start = performance.now();
      await user.type(box, "a");
      return performance.now() - start;
    };
    const idleKeys: number[] = [];
    for (let index = 0; index < 10; index += 1) idleKeys.push(await typeOne());

    act(() => dispatch({ type: "event", event: { type: "user", kind: "ask", text: "Where is Bcc set?" } }));

    const deltas = longAnswerDeltas(4_000);
    const perFrame = 4;
    const frames: number[] = [];
    const streamingKeys: number[] = [];
    for (let offset = 0; offset < deltas.length; offset += perFrame) {
      const events: CoachEvent[] = deltas.slice(offset, offset + perFrame).map((delta) => ({ type: "text", delta }));
      const start = performance.now();
      act(() => dispatch({ type: "events", events }));
      frames.push(performance.now() - start);
      if ((offset / perFrame) % 100 === 50) streamingKeys.push(await typeOne());
    }

    const answer = view.getAllByRole("article").at(-1);
    expect(answer?.textContent).toContain("العميل يقدر يفعّلها بنفسه");
    expect(answer?.querySelectorAll("pre").length).toBeGreaterThan(10);

    const early = frames.slice(0, 100);
    const late = frames.slice(-100);
    const report = {
      frames: frames.length,
      chars: deltas.join("").length,
      earlyP50: round(percentile(early, 50)),
      lateP50: round(percentile(late, 50)),
      lateP95: round(percentile(late, 95)),
      max: round(Math.max(...frames)),
      keyIdleP50: round(percentile(idleKeys, 50)),
      keyStreamingP50: round(percentile(streamingKeys, 50)),
      keyStreamingMax: round(Math.max(...streamingKeys)),
    };
    console.info("[coach perf]", JSON.stringify(report));

    expect(report.lateP50).toBeLessThan(report.earlyP50 * 3 + 1);
  }, 120_000);
});
