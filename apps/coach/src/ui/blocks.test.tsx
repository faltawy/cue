import { describe, expect, mock, test } from "bun:test";

import { act, fireEvent, render, type RenderResult, within } from "@testing-library/react";

import type { CoachEvent } from "../protocol";
import { CoachView } from "./app";
import { useDom } from "./dom-setup";
import { status } from "./fixtures";
import { type CoachState, initialState, reduce } from "./state";
import type { ActionResult, CoachApi } from "./use-coach";

useDom();

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true });
let view: RenderResult;

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
    notify: mock(() => {}),
  } satisfies CoachApi;
  view = render(<CoachView state={state} api={api} />);
  return api;
}

const done: CoachEvent = { type: "done", seconds: 2, ok: true, silent: false, interrupted: false };

const answered = (extra: CoachEvent[], text = "What did we promise?"): CoachEvent[] => [
  { type: "user", kind: "ask", text },
  { type: "text", delta: "Two promises so far." },
  ...extra,
  done,
];

const checklist: CoachEvent = {
  type: "block",
  id: "b1",
  block: {
    kind: "actions",
    items: [
      { text: "send the Bcc setup steps", owner: "You", due: "today" },
      { text: "confirm the CRM dropbox address", owner: "Sara" },
    ],
  },
};

describe("a checklist under an answer", () => {
  test("ticks items and adds one to the notes; the added item shows In notes with Undo", async () => {
    const before = stateFrom([status(), ...answered([checklist])]);
    const api = setup(before);
    const block = view.getByTestId("actions-block");
    const rows = within(block).getAllByTestId("action-item");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.querySelector("p")?.textContent)).toEqual([
      "You: send the Bcc setup steps · today",
      "Sara: confirm the CRM dropbox address",
    ]);

    fireEvent.click(within(rows[0] ?? block).getByRole("checkbox"));
    expect(api.checkItem).toHaveBeenCalledWith("b1", 0, true);
    await act(async () => {
      fireEvent.click(within(rows[1] ?? block).getByRole("button", { name: "Add to note" }));
    });
    expect(api.addItemToNote).toHaveBeenCalledWith("b1", 1);

    view.unmount();
    const after = stateFrom([
      status(),
      ...answered([checklist]),
      { type: "block_check", id: "b1", index: 0, checked: true },
      {
        type: "edit",
        edit: { id: "e9", session_id: "m1", kind: "add_action_item", summary: "Sara: confirm the CRM dropbox address", task_id: "t9" },
        block: { id: "b1", index: 1 },
      },
    ]);
    const next = setup(after);
    const [first, second] = within(view.getByTestId("actions-block")).getAllByTestId("action-item");
    expect(within(first ?? document.body).getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect(within(second ?? document.body).getByText("In notes")).toBeTruthy();
    expect(within(second ?? document.body).queryByRole("button", { name: "Add to note" })).toBeNull();
    expect(view.queryAllByTestId("coach-edit")).toHaveLength(0);
    fireEvent.click(within(second ?? document.body).getByRole("button", { name: "Undo" }));
    expect(next.undo).toHaveBeenCalledWith("e9");
  });

  test("Add to note is offered only when the coach is attached to a meeting in the app", () => {
    setup(stateFrom([status({ appConnected: false }), ...answered([checklist])]));
    expect(view.getAllByTestId("action-item")).toHaveLength(2);
    expect(view.queryByRole("button", { name: "Add to note" })).toBeNull();
  });

  test("a long checklist shows the first eight with Show all", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ text: `item ${index + 1}` }));
    setup(stateFrom([status(), ...answered([{ type: "block", id: "b2", block: { kind: "actions", items } }])]));
    expect(view.getAllByTestId("action-item")).toHaveLength(8);
    fireEvent.click(view.getByRole("button", { name: "Show all 30" }));
    expect(view.getAllByTestId("action-item")).toHaveLength(30);
  });
});

describe("follow-up chips", () => {
  const replies: CoachEvent = { type: "block", id: "r1", block: { kind: "replies", options: ["Draft the reply", "Summarise for Slack"] } };

  test("tapping one sends it as the next ask, in place of the usual suggestions", async () => {
    const api = setup(stateFrom([status(), ...answered([replies])]));
    const group = view.getByRole("group", { name: "Follow-ups" });
    expect(view.queryByRole("group", { name: "Suggestions" })).toBeNull();
    await act(async () => {
      fireEvent.click(within(group).getByRole("button", { name: "Summarise for Slack" }));
    });
    expect(api.ask).toHaveBeenCalledWith("Summarise for Slack");
  });

  test("only the latest answer offers them", () => {
    setup(stateFrom([status(), ...answered([replies]), ...answered([], "And what's still open?")]));
    expect(view.queryByRole("group", { name: "Follow-ups" })).toBeNull();
    expect(view.getByRole("group", { name: "Suggestions" })).toBeTruthy();
  });
});

describe("source chips", () => {
  test("name the site or email and open it through the coach", () => {
    const api = setup(
      stateFrom([
        status(),
        ...answered([
          {
            type: "sources",
            sources: [
              { kind: "web", url: "https://help.example.com/bcc", label: "help.example.com", title: "Outbound Bcc" },
              { kind: "email", url: "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0", label: "Re: Bcc before renewal", title: "Re: Bcc before renewal" },
            ],
          },
        ]),
      ]),
    );
    const list = view.getByRole("list", { name: "Sources" });
    fireEvent.click(within(list).getByText("Re: Bcc before renewal"));
    expect(api.open).toHaveBeenCalledWith("https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0");
    expect(within(list).getByText("help.example.com").closest("a")?.getAttribute("title")).toBe("Outbound Bcc");
  });
});
