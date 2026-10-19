import { describe, expect, mock, test } from "bun:test";

import { act, cleanup, fireEvent, render, type RenderResult, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CoachView } from "./app";
import { speakerTurns, spendTooltip } from "./components/header";
import { completeMarkdown, splitBlocks } from "./components/markdown";
import { filterCommands } from "./components/palette";
import { orderKeys } from "./components/primitives";
import { useDom } from "./dom-setup";
import type { ProactiveView } from "../proactive";
import type { CoachEvent } from "../protocol";
import type { WrapUp } from "../wrapup";
import { fixtureState, type Scenario, status } from "./fixtures";
import { type CoachState, initialState, reduce } from "./state";
import { type ActionResult, type CoachApi, eventQueue } from "./use-coach";

useDom();

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true });

function stateFrom(events: CoachEvent[]): CoachState {
  return events.reduce(
    (state, event) => reduce(state, { type: "event", event }),
    reduce(initialState, { type: "connection", connection: "open" }),
  );
}

function setup(scenario: Scenario | CoachState) {
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
  view = render(<CoachView state={typeof scenario === "string" ? fixtureState(scenario) : scenario} api={api} />);
  return api;
}

let view: RenderResult;

describe("tool steps", () => {
  test("collapsed to one line; opening shows each tool, which one failed, and its result", () => {
    setup("conversation");
    const summary = view.getByRole("button", { name: /3 steps · 1 failed/ });
    expect(summary.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(summary);
    expect(summary.getAttribute("aria-expanded")).toBe("true");

    const [grep, , brief] = view.getAllByTestId("step");
    expect(grep?.getAttribute("data-status")).toBe("ok");
    expect(brief?.getAttribute("data-status")).toBe("failed");
    const row = within(grep ?? document.body).getByRole("button", { name: /Read the transcript/ });
    fireEvent.click(row);
    expect(within(grep ?? document.body).getByText(/Sara: Can your email channel/)).toBeTruthy();
  });
});

describe("a question from the coach", () => {
  test("clicking an option answers it", () => {
    const api = setup("question");
    fireEvent.click(view.getByRole("button", { name: /Formal/ }));
    expect(api.answer).toHaveBeenCalledWith("q1", ["Formal"]);
  });

  test("a number key picks an option from the empty question box, but types normally once you've started", async () => {
    const api = setup("question");
    const box = view.getByRole("textbox", { name: "Ask the coach" });
    box.focus();
    fireEvent.keyDown(box, { key: "3" });
    expect(api.answer).toHaveBeenCalledWith("q1", ["In Arabic"]);

    api.answer.mockClear();
    await userEvent.setup({ document }).type(box, "Keep it 2");
    expect((box as HTMLTextAreaElement).value).toBe("Keep it 2");
    expect(api.answer).not.toHaveBeenCalled();
  });

  test("Escape skips the question; typing an answer sends it as the answer", async () => {
    const api = setup("question");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.dismiss).toHaveBeenCalledWith("q1");
    expect(api.stop).not.toHaveBeenCalled();

    const box = view.getByRole("textbox", { name: "Ask the coach" });
    await userEvent.setup({ document }).type(box, "Short, in English{Enter}");
    expect(api.answer).toHaveBeenCalledWith("q1", ["Short, in English"]);
    expect(api.ask).not.toHaveBeenCalled();
  });
});

describe("errors", () => {
  test("say what went wrong in plain words, offer to try again, and keep the details folded", () => {
    const api = setup("error");
    const card = view.getByRole("alert");
    expect(within(card).getByText("Sign-in expired")).toBeTruthy();
    expect(within(card).queryByText(/Terminal/)).toBeNull();
    expect(within(card).queryByText(/OAuth token has expired/)).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "Sign in again" }));
    expect(api.signIn).toHaveBeenCalledTimes(1);
    fireEvent.click(within(card).getByRole("button", { name: "Details" }));
    expect(within(card).getByText(/OAuth token has expired/)).toBeTruthy();
    expect(within(card).getByText(/open Terminal, run `claude`/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: /Try again/ }));
    expect(api.ask).toHaveBeenCalledWith("What did Sara just ask?");
  });
});

describe("wrap-up card", () => {
  test("copies the follow-up, adds action items, and hides logging to clients when it can't run", async () => {
    const writeText = mock((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const api = setup("ended");
    const card = view.getByTestId("wrap-up");

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /Copy follow-up/ }));
    });
    expect(writeText.mock.calls[0]?.[0]).toStartWith("Thanks for the time today, Sara and Omar.");
    expect(within(card).getByRole("button", { name: /Copied/ })).toBeTruthy();

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: /Add as action items/ }));
    });
    expect(api.addActionItems).toHaveBeenCalledTimes(1);

    expect(within(card).queryByRole("button", { name: /Log promises to clients/ })).toBeNull();
  });
});

describe("coach edits", () => {
  test("show what changed with Undo on the newest edit", () => {
    const api = setup("conversation");
    const edit = view.getByTestId("coach-edit");
    expect(within(edit).getByText("Send Sara the Bcc setup steps")).toBeTruthy();
    fireEvent.click(within(edit).getByRole("button", { name: "Undo" }));
    expect(api.undo).toHaveBeenCalledWith("edit-1");
  });
});

describe("keyboard", () => {
  test("Enter sends, ↑ brings back the last question, Escape stops an answer", async () => {
    const api = setup("conversation");
    const box = view.getByRole("textbox", { name: "Ask the coach" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect((box as HTMLTextAreaElement).value).toBe("Add an action item to send Sara the Bcc steps");
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(api.ask).toHaveBeenCalledWith("Add an action item to send Sara the Bcc steps");

    cleanup();
    const busy = setup("thinking");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(busy.stop).toHaveBeenCalledTimes(1);
  });

  test("⌘K opens actions you can filter and run", async () => {
    const api = setup("conversation");
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = view.getByRole("dialog", { name: "Actions" });
    const input = within(dialog).getByRole("combobox");
    await userEvent.setup({ document }).type(input, "catch{Enter}");
    expect(api.newChat).not.toHaveBeenCalled();
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("dialog", { name: "Actions" })).toBeNull();
  });
});

describe("empty and offline states", () => {
  test("before a meeting: what's happening and what to ask, with a suggestion that sends", () => {
    const api = setup("idle");
    expect(view.getByRole("heading", { name: "Waiting for your meeting" })).toBeTruthy();
    expect(view.getByText(/Start recording in Cue \(⇧⌘N\)/)).toBeTruthy();
    expect(view.queryByText(/Not recording/)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Help me prepare for a meeting" }));
    expect(api.ask).toHaveBeenCalledWith("Help me prepare for a meeting");
  });
});

describe("live transcript", () => {
  test("collapsed shows what's being said now; opening lists every turn with the speaker in its own column", () => {
    setup("conversation");
    const strip = view.getByRole("region", { name: "Live transcript" });
    const toggle = within(strip).getByRole("button", { name: "Show the transcript" });
    expect(within(strip).getByTestId("strip-now").textContent).toBe("Our sales team needs every reply logged");
    expect(within(strip).queryByText("Sure, go ahead.")).toBeNull();

    fireEvent.click(toggle);
    const speakers = within(strip)
      .getAllByRole("term")
      .map((term) => term.textContent);
    expect(speakers).toEqual(["Sara", "You", "Sara", "Omar"]);
    expect(within(strip).getByText("Sure, go ahead.")).toBeTruthy();
    expect(within(strip).getByText("Our sales team needs every reply logged")).toBeTruthy();
  });

  test("consecutive lines from one speaker become one turn", () => {
    expect(
      speakerTurns([
        { speaker: "Sara", you: false, text: "One." },
        { speaker: "Sara", you: false, text: "Two." },
        { speaker: "You", you: true, text: "Three." },
        { speaker: "Sara", you: false, text: "Four." },
      ]),
    ).toEqual([
      { speaker: "Sara", you: false, texts: ["One.", "Two."] },
      { speaker: "You", you: true, texts: ["Three."] },
      { speaker: "Sara", you: false, texts: ["Four."] },
    ]);
  });
});

const ARABIC_TITLE = "اجتماع المتابعة الأسبوعي مع فريق المبيعات";
const waitingAfter = (lastTitle: string): CoachEvent => ({ type: "transcript", strip: { state: "waiting", lastTitle, endedAt: null }, lines: [], pending: "" });
const NO_COACHING: WrapUp["coaching"] = { went_well: [], next_time: [] };
const readyWrapUp = (wrapUp: Omit<WrapUp, "coaching"> & { coaching?: WrapUp["coaching"] }): CoachEvent => ({
  type: "wrapup",
  wrapUp: {
    state: "ready",
    title: ARABIC_TITLE,
    wrapUp: { coaching: NO_COACHING, ...wrapUp },
    commitments: [],
    actions: { addActionItems: { enabled: true, hint: null }, logToClients: { enabled: false, hint: null } },
    added: false,
    logged: false,
  },
});

describe("worst-case data", () => {
  test("an Arabic meeting title sits in its own direction-aware element, apart from the English label before it", () => {
    setup(stateFrom([status({ meeting: false }), waitingAfter(ARABIC_TITLE), readyWrapUp({ commitments: [], open_questions: [], follow_up_draft: "Thanks." })]));
    const [header = document.body] = view.getAllByRole("banner");
    expect(within(header).getByText(ARABIC_TITLE).getAttribute("dir")).toBe("auto");
    expect(within(header).getByTestId("header-subtitle").textContent).toBe("Ended");
    const card = view.getByTestId("wrap-up");
    expect(within(card).getByRole("heading", { name: "Wrap-up" })).toBeTruthy();
    expect(within(card).queryByText(ARABIC_TITLE)).toBeNull();
  });

  test("an empty follow-up draft shows no draft box or copy button, and the suggestions offer to write one", () => {
    setup(stateFrom([status({ meeting: false }), waitingAfter("Weekly"), readyWrapUp({ commitments: [], open_questions: ["Internal notes too?"], follow_up_draft: "  " })]));
    const card = view.getByTestId("wrap-up");
    expect(within(card).getByText("Open questions")).toBeTruthy();
    expect(within(card).queryByText("Follow-up draft")).toBeNull();
    expect(within(card).queryByRole("button", { name: /Copy follow-up/ })).toBeNull();
    expect(view.getByRole("button", { name: "Draft a follow-up" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Make the follow-up shorter" })).toBeNull();
  });

  test("a repeated open question renders twice without a duplicate-key error", () => {
    const errors = mock((..._args: unknown[]) => {});
    const original = console.error;
    console.error = errors;
    try {
      setup(stateFrom([status({ meeting: false }), waitingAfter("Weekly"), readyWrapUp({ commitments: [], open_questions: ["Internal notes too?", "Internal notes too?"], follow_up_draft: "Thanks." })]));
    } finally {
      console.error = original;
    }
    expect(within(view.getByTestId("wrap-up")).getAllByText("Internal notes too?")).toHaveLength(2);
    expect(errors.mock.calls.filter((call) => String(call[0]).includes("same key"))).toEqual([]);
  });

  test("the project menu names the folder, the long path, and plain choices with the series as a second line", () => {
    const path = "/Users/aleksandra.wisniewska-kowalczyk/work/clients/northwind-industries-holdings/customer-success-playbooks";
    setup(stateFrom([status({ project: { path, source: "series", series: "Northwind weekly", defaultProject: "/Users/a/northwind" } })]));
    fireEvent.click(view.getByRole("button", { name: /customer-success-playbooks/ }));
    const menu = view.getByRole("menu", { name: "Project folder" });
    expect(within(menu).getByTestId("project-folder").textContent).toBe("customer-success-playbooks");
    expect(within(menu).getByText(path)).toBeTruthy();
    expect(within(menu).getByTestId("project-source").textContent).toBe("Set for this series");
    expect(within(menu).getByRole("menuitem", { name: /^Choose folder for this series…\s*Northwind weekly$/ })).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: /^Use default folder\s*northwind$/ })).toBeTruthy();
  });

  test("with several questions, a single-choice one uses radio buttons and a multi-choice one uses checkboxes", () => {
    setup(
      stateFrom([
        status({ busy: true }),
        { type: "user", kind: "ask", text: "Draft a reply" },
        {
          type: "question",
          id: "q2",
          questions: [
            { question: "Which tone?", header: "Tone", multiSelect: false, options: [{ label: "Formal", description: "" }, { label: "Warm", description: "" }] },
            { question: "Which points?", header: "Scope", multiSelect: true, options: [{ label: "Bcc", description: "" }, { label: "SSO", description: "" }] },
          ],
        },
      ]),
    );
    const panel = view.getByTestId("question-panel");
    const tone = within(panel).getByRole("radiogroup", { name: "Which tone?" });
    fireEvent.click(within(tone).getByRole("radio", { name: /Formal/ }));
    fireEvent.click(within(tone).getByRole("radio", { name: /Warm/ }));
    expect(within(tone).getByRole("radio", { name: /Warm/ }).getAttribute("aria-checked")).toBe("true");
    expect(within(tone).getByRole("radio", { name: /Formal/ }).getAttribute("aria-checked")).toBe("false");
    const scope = within(panel).getByRole("group", { name: "Which points?" });
    fireEvent.click(within(scope).getByRole("checkbox", { name: /Bcc/ }));
    fireEvent.click(within(scope).getByRole("checkbox", { name: /SSO/ }));
    expect(within(scope).getAllByRole("checkbox").map((box) => box.getAttribute("aria-checked"))).toEqual(["true", "true"]);
  });
});

describe("design review", () => {
  test("an edit shows one receipt: the card with its kind, not also a step row", () => {
    setup("conversation");
    const edit = view.getByTestId("coach-edit");
    expect(within(edit).getByRole("img", { name: "Action item added" })).toBeTruthy();
    expect(view.getAllByText("Read the transcript").length).toBeGreaterThan(0);
    expect(view.queryByText("Added an action item")).toBeNull();
  });

  test("an open question is announced once: no activity row, no hint line, no one-question header", () => {
    setup("question");
    const panel = view.getByTestId("question-panel");
    expect(within(panel).getByText("How formal should the reply be?")).toBeTruthy();
    expect(view.queryByText("Waiting for your answer")).toBeNull();
    expect(within(panel).queryByText(/Press 1/)).toBeNull();
    expect(within(panel).queryByText("Tone")).toBeNull();
    expect(within(panel).queryByText(/\(Recommended\)/)).toBeNull();
    expect(within(panel).getByText("Suggested")).toBeTruthy();
  });

  test("suggestions stay hidden while the wrap-up is being written and under an error", () => {
    setup("wrapping");
    expect(view.queryByRole("group", { name: "Suggestions" })).toBeNull();
    cleanup();
    setup("error");
    expect(view.queryByRole("group", { name: "Suggestions" })).toBeNull();
    cleanup();
    setup("ended");
    expect(view.getByRole("group", { name: "Suggestions" })).toBeTruthy();
  });

  test("the header shows a muted recording timer while live and how long ago the meeting ended", () => {
    setup("live");
    expect(view.getByTestId("header-subtitle").textContent).toMatch(/^Recording · 12:0\d$/);
    cleanup();
    setup("ended");
    expect(view.getByRole("banner").textContent).toContain("Wafeq weekly sync");
    expect(view.getByTestId("header-subtitle").textContent).toBe("Ended 4m ago");
    expect(view.getByRole("textbox", { name: "Ask the coach" }).getAttribute("placeholder")).toBe("Ask about this meeting…");
  });

  test("while live the header shows the meeting's estimated spend, says when nudges hit the limit, and nothing before any spend", () => {
    const live = fixtureState("live");
    const spent = {
      nudgesUsd: 0.0123,
      capUsd: 0.5,
      meetingUsd: 0.0441,
      meetingTokens: 182_400,
      cachedTokens: 160_000,
    };
    const withProactive = (proactive: ProactiveView): CoachState => ({
      ...live,
      status: status({ proactive }),
    });
    setup(withProactive({ state: "on", ...spent }));
    expect(view.getByTestId("proactive-budget").textContent).toBe("≈$0.04 this meeting");
    expect(spendTooltip({ state: "on", ...spent })).toBe(
      "Nudges ≈$0.01 of the $0.50 limit. 182k tokens this meeting, 160k of them re-read from cache.",
    );
    cleanup();
    setup(withProactive({ state: "off", ...spent, nudgesUsd: 0, meetingUsd: 0.004 }));
    expect(view.getByTestId("proactive-budget").textContent).toBe("<$0.01 this meeting");
    cleanup();
    setup(withProactive({ state: "capped", ...spent, nudgesUsd: 0.5, meetingUsd: 0.71 }));
    expect(view.getByTestId("proactive-budget").textContent).toBe("Nudges paused");
    expect(spendTooltip({ state: "capped", ...spent })).toStartWith(
      "Nudges reached the $0.50 limit for this meeting. Asking still works.",
    );
    cleanup();
    setup(withProactive({ state: "on", ...spent, nudgesUsd: 0, meetingUsd: 0, meetingTokens: 0, cachedTokens: 0 }));
    expect(view.getByTestId("header-subtitle").textContent).toMatch(/^Recording/);
    expect(view.queryByTestId("proactive-budget")).toBeNull();
  });

  test("a long chat marks New chat instead of showing a bar or a second button", () => {
    const usage = (contextTokens: number): CoachEvent => ({
      type: "usage",
      usage: { model: "m", inputTokens: 1, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 1, costUsd: 0, contextTokens, contextWindow: 200_000 },
    });
    setup(stateFrom([status(), usage(150_000)]));
    expect(view.queryByTestId("long-chat-dot")).toBeNull();
    expect(view.getByRole("button", { name: "New chat" })).toBeTruthy();
    cleanup();
    setup(stateFrom([status(), usage(170_000)]));
    expect(view.getByTestId("long-chat-dot")).toBeTruthy();
    expect(view.getByRole("button", { name: "New chat (this chat is getting long)" })).toBeTruthy();
  });

  test("Catch me up is the filled action while live, runs on ⌘J, and leads the ⌘K list", () => {
    const api = setup("live");
    const strip = view.getByRole("region", { name: "Live transcript" });
    const catchUp = within(strip).getByRole("button", { name: "Catch me up" });
    expect(catchUp.className).toContain("bg-primary");
    fireEvent.keyDown(window, { key: "j", metaKey: true });
    expect(api.checkIn).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const [first] = within(view.getByRole("listbox", { name: "Commands" })).getAllByRole("option");
    expect(first?.textContent).toContain("Catch me up");
  });
});

describe("second design review", () => {
  test("a long draft fades out at the bottom instead of ending on an ellipsis, with Show all", () => {
    const draft = Array.from({ length: 12 }, (_, line) => `Line ${line + 1} of the follow-up.`).join("\n");
    setup(stateFrom([status({ meeting: false }), waitingAfter("Weekly"), readyWrapUp({ commitments: [], open_questions: [], follow_up_draft: draft })]));
    const text = view.getByTestId("follow-up-draft");
    expect(text.className).toContain("coach-fade-bottom");
    expect(text.className).not.toContain("line-clamp");
    fireEvent.click(view.getByRole("button", { name: "Show all" }));
    expect(view.getByTestId("follow-up-draft").className).not.toContain("coach-fade-bottom");
  });

  test("coaching shows what went well and, for next time, each moment with what to do instead", () => {
    const coaching = {
      went_well: ["[03:10] You asked Marco what was driving the budget gap."],
      next_time: [{ moment: "[12:40] Marco pushed back on price", instead: 'Ask: "Price aside, is this the solution you want?"' }],
    };
    setup(stateFrom([status({ meeting: false }), waitingAfter("Weekly"), readyWrapUp({ commitments: [], open_questions: [], follow_up_draft: "", coaching })]));
    const card = view.getByTestId("wrap-up");
    expect(within(card).getByRole("heading", { name: "Went well" })).toBeTruthy();
    expect(within(card).getByText("[03:10] You asked Marco what was driving the budget gap.")).toBeTruthy();
    const next = within(card).getByRole("list", { name: "Next time" });
    expect(within(next).getByText("[12:40] Marco pushed back on price")).toBeTruthy();
    expect(within(next).getByText('Ask: "Price aside, is this the solution you want?"').getAttribute("dir")).toBe("auto");
  });

  test("an empty wrap-up is one quiet line with no card and no wrap-up suggestions", () => {
    setup(stateFrom([status({ meeting: false }), waitingAfter("Weekly"), readyWrapUp({ commitments: [], open_questions: [], follow_up_draft: "" })]));
    expect(view.getByTestId("wrap-up").textContent).toBe("Too short to wrap up.");
    expect(view.queryByRole("heading", { name: "Wrap-up" })).toBeNull();
    expect(view.queryByRole("group", { name: "Suggestions" })).toBeNull();
  });

  test("Catch me up looks and says unavailable while an answer is running", () => {
    setup("thinking");
    const strip = view.getByRole("region", { name: "Live transcript" });
    const button = within(strip).getByRole("button", { name: "Catch me up" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).not.toContain("bg-primary");
    expect(within(strip).getByText("Available when this answer finishes")).toBeTruthy();
  });

  test("reconnecting keeps the meeting title and locks Undo and Ask again", () => {
    setup(fixtureState("conversation", "lost"));
    const [header = document.body] = view.getAllByRole("banner");
    expect(within(header).getByText("Wafeq weekly sync")).toBeTruthy();
    expect(within(header).getByTestId("header-subtitle").textContent).toBe("Reconnecting…");
    expect(view.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(view.queryByRole("button", { name: "Ask again" })).toBeNull();
    cleanup();
    setup("conversation");
    expect(view.getByRole("button", { name: "Undo" })).toBeTruthy();
  });

  test("an expired sign-in offers Sign in again first, then Try again; Catch me up steps back", () => {
    const api = setup("error");
    const card = view.getByRole("alert");
    expect(within(card).getByText("Your session timed out.")).toBeTruthy();
    expect(within(card).queryByRole("button", { name: /Try again/ })).toBeNull();
    const strip = view.getByRole("region", { name: "Live transcript" });
    expect(within(strip).getByRole("button", { name: "Catch me up" }).className).not.toContain("bg-primary");
    fireEvent.click(within(card).getByRole("button", { name: "Sign in again" }));
    expect(api.signIn).toHaveBeenCalledTimes(1);
    expect(within(card).queryByRole("button", { name: "Sign in again" })).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /Try again/ }));
    expect(api.ask).toHaveBeenCalledWith("What did Sara just ask?");
  });

  test("logging promises reads as done once started", () => {
    setup(
      stateFrom([
        status({ meeting: false }),
        waitingAfter("Weekly"),
        {
          type: "wrapup",
          wrapUp: {
            state: "ready",
            title: "Weekly",
            wrapUp: { commitments: [{ who: "You", what: "send steps", when: null }], open_questions: [], follow_up_draft: "Thanks.", coaching: NO_COACHING },
            commitments: ["You: send steps"],
            actions: { addActionItems: { enabled: true, hint: null }, logToClients: { enabled: true, hint: null } },
            added: false,
            logged: true,
          },
        },
      ]),
    );
    expect(view.getByRole("button", { name: /Logged to clients/ })).toBeTruthy();
  });

  test("shortcuts list modifiers in Apple order", () => {
    expect(orderKeys(["mod", "shift", "o"])).toEqual(["shift", "mod", "o"]);
    expect(orderKeys(["mod", "alt", "ctrl", "k"])).toEqual(["ctrl", "alt", "mod", "k"]);
  });
});

describe("catch me up", () => {
  test("its answer shows under its own label; the strip button, not Ask again, runs another", () => {
    setup(
      stateFrom([
        status(),
        { type: "user", kind: "catchup", text: "Catch me up · 22:21" },
        { type: "text", delta: "They're discussing WhatsApp sessions that stayed open." },
        { type: "done", seconds: 4, ok: true, silent: false, interrupted: false },
      ]),
    );
    const turn = view.getByRole("article", { name: "Catch up" });
    expect(within(turn).getByText("Catch me up · 22:21")).toBeTruthy();
    expect(within(turn).getByText("They're discussing WhatsApp sessions that stayed open.")).toBeTruthy();
    expect(within(turn).getByRole("button", { name: "Copy answer" })).toBeTruthy();
    expect(within(turn).queryByRole("button", { name: "Ask again" })).toBeNull();
  });
});

describe("helpers", () => {
  test("closes markdown left open mid-stream so it renders instead of showing raw markers", () => {
    expect(completeMarkdown("Set it under **Settings → Cha")).toBe("Set it under **Settings → Cha**");
    expect(completeMarkdown("See `backend/src")).toBe("See `backend/src`");
    expect(completeMarkdown("```ts\nconst a = 1")).toBe("```ts\nconst a = 1\n```");
    expect(completeMarkdown("**done** and `code`")).toBe("**done** and `code`");
  });

  test("long answers split into blocks at blank lines, never inside code or an indented continuation", () => {
    expect(splitBlocks("One.\n\nTwo.\n\n- a\n- b")).toEqual(["One.", "Two.", "- a\n- b"]);
    expect(splitBlocks("```\nx\n\ny\n```\n\nAfter")).toEqual(["```\nx\n\ny\n```", "After"]);
    expect(splitBlocks("1. item\n\n   more of the item\n\nNext")).toEqual(["1. item\n\n   more of the item", "Next"]);
  });

  test("events arriving within a frame reach the state together, once", () => {
    const delivered: string[][] = [];
    const frames: Array<() => void> = [];
    const queue = eventQueue(
      (events) => delivered.push(events.map((event) => (event.type === "text" ? event.delta : event.type))),
      (next) => {
        frames.push(next);
        return () => {};
      },
    );
    queue.push({ type: "text", delta: "a" });
    queue.push({ type: "text", delta: "b" });
    expect(delivered).toEqual([]);
    expect(frames).toHaveLength(1);
    frames[0]?.();
    queue.push({ type: "text", delta: "c" });
    queue.flush();
    expect(delivered).toEqual([["a", "b"], ["c"]]);
  });

  test("command filtering prefers prefixes, then word starts, then letters in order", () => {
    const run = () => {};
    const commands = [
      { id: "a", label: "Copy the last answer", run },
      { id: "b", label: "Check in now", run },
      { id: "c", label: "New chat", run },
    ];
    expect(filterCommands(commands, "ch").map((command) => command.id)).toEqual(["b", "c"]);
    expect(filterCommands(commands, "cla").map((command) => command.id)).toEqual(["a"]);
    expect(filterCommands(commands, "zzz")).toEqual([]);
  });
});
