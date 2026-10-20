import { describe, expect, mock, test } from "bun:test";

import { fireEvent, render, within } from "@testing-library/react";

import { coachError, GAVE_UP, withSignIn } from "../errors";
import type { CoachEvent } from "../protocol";
import { CoachView } from "./app";
import { useDom } from "./dom-setup";
import { status } from "./fixtures";
import { type CoachState, initialState, reduce } from "./state";
import type { ActionResult, CoachApi } from "./use-coach";

useDom();

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true });

function stateFrom(events: readonly CoachEvent[]): CoachState {
  return events.reduce(
    (state, event) => reduce(state, { type: "event", event }),
    reduce(initialState, { type: "connection", connection: "open" }),
  );
}

function setup(state: CoachState) {
  const api = {
    ask: mock(ok),
    checkItem: mock(ok),
    addItemToNote: mock(ok),
    open: mock(ok),
    stop: mock(ok),
    checkIn: mock(ok),
    newChat: mock(ok),
    answer: mock(ok),
    dismiss: mock(ok),
    undo: mock(ok),
    chooseSeriesFolder: mock(ok),
    useDefaultFolder: mock(ok),
    addActionItems: mock(ok),
    logToClients: mock(ok),
    signIn: mock(ok),
    chooseProjectFolder: mock(ok),
    retrySetup: mock(ok),
    notify: mock(() => {}),
  } satisfies CoachApi;
  return { api, view: render(<CoachView state={state} api={api} />) };
}

const stopped = (message: string): CoachEvent => ({ type: "error", error: coachError({ message }) });

describe("repeated errors", () => {
  test("identical errors in a row collapse into one card with a count; a different one starts a new card", () => {
    const state = stateFrom([
      status(),
      stopped("Claude Code exited unexpectedly."),
      stopped("Claude Code exited unexpectedly."),
      stopped("Claude Code exited unexpectedly."),
      { type: "error", error: coachError({ message: "429 Too Many Requests" }) },
    ]);
    expect(state.items.map((item) => (item.kind === "error" ? [item.error.title, item.count] : item.kind))).toEqual([
      ["The coach hit an error", 3],
      ["Usage limit reached", 1],
    ]);
    const { view } = setup(state);
    const cards = view.getAllByTestId("error-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0] ?? document.body).getByText("3 times")).toBeTruthy();
    expect(within(cards[1] ?? document.body).queryByText(/times/)).toBeNull();
  });

  test("the card shown when the coach gives up offers a new chat", () => {
    const { api, view } = setup(
      stateFrom([status(), { type: "error", error: { ...coachError({ message: "Claude Code exited unexpectedly." }), ...GAVE_UP } }]),
    );
    const card = view.getByTestId("error-card");
    expect(within(card).getByText("The coach stopped")).toBeTruthy();
    within(card).getByRole("button", { name: "New chat" }).click();
    expect(api.newChat).toHaveBeenCalledTimes(1);
  });

  test("someone who never signed in is asked to sign in, not to sign in again", () => {
    const { api, view } = setup(
      stateFrom([status(), { type: "error", error: withSignIn(coachError({ message: "Not logged in · Please run /login" }), false) }]),
    );
    const card = view.getByTestId("error-card");
    expect(within(card).getByText("Sign in to Claude")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: "Sign in again" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Sign in" }));
    expect(api.signIn).toHaveBeenCalledTimes(1);
  });
});
