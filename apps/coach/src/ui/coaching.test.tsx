import {
  act,
  fireEvent,
  render,
  type RenderResult,
  within,
} from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BlockKind } from "../blocks";
import { emptyStore, loadChats, remember, saveChats } from "../chat-store";
import { type MeetingCoaching, MeetingIntent } from "../coaching-preferences";
import { StripState } from "../meeting-state";
import { type Move, MoveTag, MoveVerb } from "../move";
import {
  appendHistory,
  type CoachEvent,
  CoachEventType,
  ResetReason,
  TurnKind,
  WrapUpState,
  type WrapUpView,
} from "../protocol";
import { type TalkStats } from "../talk-time";
import { type WrapUp } from "../wrapup";
import { CoachView } from "./app";
import { useDom } from "./dom-setup";
import { status } from "./fixtures";
import {
  ActionType,
  type CoachState,
  Connection,
  initialState,
  reduce,
} from "./state";
import { type ActionResult, type CoachApi } from "./use-coach";

useDom();

const ok = (): Promise<ActionResult> => Promise.resolve({ ok: true });
let view: RenderResult;

function stateFrom(events: readonly CoachEvent[]): CoachState {
  return events.reduce(
    (state, event) => reduce(state, { type: ActionType.Event, event }),
    reduce(initialState, {
      type: ActionType.Connection,
      connection: Connection.Open,
    }),
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
    openEvidence: mock(ok),
    feedback: mock(ok),
    resetFeedback: mock(ok),
    setCoaching: mock(
      (_input: Partial<MeetingCoaching> & { sessionId: string }) => ok(),
    ),
    notify: mock(() => {}),
  } satisfies CoachApi;
  view = render(<CoachView state={state} api={api} />);
  return api;
}

function clipboard() {
  const writeText = mock((_text: string) => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

const PUSHBACK: Move = {
  tag: MoveTag.Pushback,
  headline: "Ask what's behind the price concern",
  verb: MoveVerb.Ask,
  line: "Is it the total, or how it lands in this quarter's budget?",
  watch_out: "Don't discount before you know",
  moment: {
    speaker: "Marco",
    quote: "Honestly this is more than we budgeted.",
    at: "12:40",
  },
};

const TALK: TalkStats = {
  spanMs: 420_000,
  totalMs: 400_000,
  speakers: [
    { speaker: "You", ms: 296_000 },
    { speaker: "Marco", ms: 64_000 },
    { speaker: "Sara", ms: 40_000 },
  ],
  youLongestMs: 185_000,
  youQuestions: 1,
};

const done: CoachEvent = {
  type: CoachEventType.Done,
  seconds: 3,
  ok: true,
  silent: false,
  interrupted: false,
};
const nudge = (move: Move, extra: CoachEvent[] = []): CoachEvent[] => [
  {
    type: CoachEventType.User,
    kind: TurnKind.Nudge,
    text: "Question for you · 14:32",
  },
  {
    type: CoachEventType.Block,
    id: "m1",
    block: { kind: BlockKind.Move, ...move },
  },
  ...extra,
  done,
];

describe("meeting coaching controls", () => {
  test("saves meeting intention and quiet mode, retries failures, and resets selection for the next session", async () => {
    const live: CoachEvent = {
      type: CoachEventType.Transcript,
      strip: { state: StripState.Live, title: "Review", startedAt: 1 },
      lines: [],
      pending: "",
    };
    let state = stateFrom([
      status({
        coaching: {
          sessionId: "session-a",
          intent: MeetingIntent.General,
          quiet: false,
        },
      }),
      live,
      ...nudge(PUSHBACK),
    ]);
    const api = setup(state);
    let request: unknown;
    let complete!: (result: ActionResult) => void;
    api.setCoaching.mockImplementation((input) => {
      request = input;
      return new Promise((resolve) => {
        complete = resolve;
      });
    });
    await act(async () =>
      fireEvent.change(
        view.getByRole("combobox", { name: "Meeting intention" }),
        { target: { value: "listening" } },
      ),
    );
    expect(request).toEqual({ sessionId: "session-a", intent: "listening" });
    expect(
      (
        view.getByRole("button", {
          name: "Quiet for this meeting",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => complete({ ok: false, message: "Connection lost" }));
    expect(view.getByRole("alert").textContent).toBe("Connection lost");
    api.setCoaching.mockImplementation(async (input) => {
      request = input;
      state = reduce(state, {
        type: ActionType.Event,
        event: status({
          coaching: {
            sessionId: "session-a",
            intent: MeetingIntent.Listening,
            quiet: true,
          },
        }),
      });
      view.rerender(<CoachView state={state} api={api} />);
      return { ok: true };
    });
    await act(async () =>
      fireEvent.click(
        view.getByRole("button", { name: "Quiet for this meeting" }),
      ),
    );
    expect(request).toEqual({ sessionId: "session-a", quiet: true });
    expect(
      view.getByRole("button", { name: "Resume suggestions" }),
    ).toBeTruthy();
    expect(
      (
        view.getByRole("combobox", {
          name: "Meeting intention",
        }) as HTMLSelectElement
      ).value,
    ).toBe("listening");
    fireEvent.click(view.getByRole("button", { name: "Dismiss suggestion" }));
    expect(view.queryByText(PUSHBACK.line) === null).toBe(true);
    const next = stateFrom([
      status({
        coaching: {
          sessionId: "session-b",
          intent: MeetingIntent.General,
          quiet: false,
        },
      }),
      live,
      ...nudge(PUSHBACK),
    ]);
    view.rerender(<CoachView state={next} api={api} />);
    expect(view.getByText(PUSHBACK.line)).toBeTruthy();
    expect(
      view.getByRole("button", { name: "Quiet for this meeting" }),
    ).toBeTruthy();
  });
});

describe("live suggestions", () => {
  test("keeps the sentence being read until the user moves on, while chat and explicit feedback remain usable", async () => {
    const live: CoachEvent = {
      type: CoachEventType.Transcript,
      strip: { state: StripState.Live, title: "Review", startedAt: 1 },
      lines: [],
      pending: "",
    };
    const first = stateFrom([status(), live, ...nudge(PUSHBACK)]);
    const api = setup(first);
    expect(view.getByText(PUSHBACK.line)).toBeTruthy();
    expect(
      view.queryByRole("heading", { name: PUSHBACK.headline }) === null,
    ).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Suggestion details" }));
    expect(view.getByRole("heading", { name: PUSHBACK.headline })).toBeTruthy();
    const second = {
      ...PUSHBACK,
      line: "What would make the next step easier?",
    };
    const updated = [
      ...nudge(second),
      {
        type: CoachEventType.User,
        kind: TurnKind.Ask,
        text: "Help me understand",
      },
      { type: CoachEventType.Text, delta: "Here is the context." },
      done,
    ] as CoachEvent[];
    const next = updated.reduce(
      (state, event) => reduce(state, { type: ActionType.Event, event }),
      first,
    );
    view.rerender(<CoachView state={next} api={api} />);
    expect(view.getByText(PUSHBACK.line)).toBeTruthy();
    expect(view.getByText("Here is the context.")).toBeTruthy();
    expect(view.queryByText(second.line) === null).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Next suggestion" }));
    expect(view.getByText(second.line)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "Dismiss suggestion" }));
    expect(view.queryByText(second.line) === null).toBe(true);
    fireEvent.click(view.getByRole("button", { name: "Earlier suggestions" }));
    expect(view.getByText(PUSHBACK.line)).toBeTruthy();
    expect(view.getByText(second.line)).toBeTruthy();
    expect(api.feedback.mock.calls).toHaveLength(0);
    await act(async () =>
      fireEvent.click(view.getAllByRole("button", { name: "Useful" })[0]!),
    );
    expect(view.getByText("Feedback saved")).toBeTruthy();
    expect(api.feedback).toHaveBeenCalledWith({
      category: "pushback",
      useful: true,
    });
    const reset: CoachEvent[] = [
      { type: CoachEventType.Reset, reason: ResetReason.Manual },
      ...nudge(PUSHBACK),
    ];
    const fresh = reset.reduce(
      (state, event) => reduce(state, { type: ActionType.Event, event }),
      next,
    );
    view.rerender(<CoachView state={fresh} api={api} />);
    expect(view.getByText(PUSHBACK.line)).toBeTruthy();
  });
});

describe("a coaching move", () => {
  test("shows its tag as text, the headline, the Ask line, the watch-out and the moment with speaker and time", () => {
    setup(stateFrom([status(), ...nudge(PUSHBACK)]));
    const card = view.getByTestId("move");
    expect(within(card).getByText("Pushback")).toBeTruthy();
    expect(
      within(card).getByText("Ask what's behind the price concern"),
    ).toBeTruthy();
    const line = within(card).getByTestId("move-line");
    expect(within(line).getByText("Ask")).toBeTruthy();
    expect(within(line).getByText(PUSHBACK.line).getAttribute("dir")).toBe(
      "auto",
    );
    expect(
      within(card).getByText("Don't discount before you know"),
    ).toBeTruthy();
    const moment = within(card).getByTestId("move-moment");
    expect(
      within(moment).getByText("Honestly this is more than we budgeted."),
    ).toBeTruthy();
    expect(moment.getAttribute("dir")).toBe("auto");
    expect(within(moment).getByText("Marco")).toBeTruthy();
    expect(within(moment).getByText("12:40")).toBeTruthy();
  });

  test("an automatic nudge opens its own transcript moment and records useful feedback", async () => {
    const move = {
      ...PUSHBACK,
      evidence: { sessionId: "session-a", timestampMs: 760_000 },
    };
    const api = setup(stateFrom([status(), ...nudge(move)]));
    const card = view.getByTestId("move");

    await act(async () => {
      fireEvent.click(
        within(card).getByRole("button", { name: "Open transcript at 12:40" }),
      );
    });
    let complete!: (result: ActionResult) => void;
    api.feedback.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    fireEvent.click(within(card).getByRole("button", { name: "Useful" }));
    expect(
      (
        within(card).getByRole("button", {
          name: "Useful",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await act(async () => {
      complete({ ok: false, message: "Could not save feedback." });
    });
    expect(within(card).getByRole("alert").textContent).toBe(
      "Could not save feedback.",
    );
    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Useful" }));
    });
    expect(within(card).getByRole("status").textContent).toBe("Feedback saved");

    expect(api.openEvidence).toHaveBeenCalledWith({
      sessionId: "session-a",
      timestampMs: 760_000,
    });
    expect(api.feedback).toHaveBeenCalledWith({
      category: "pushback",
      useful: true,
      momentId: "session-a:760000",
    });
  });

  test("not-useful feedback can suppress a repeat for the same handled moment", async () => {
    const move = {
      ...PUSHBACK,
      evidence: { sessionId: "session-b", timestampMs: 321_000 },
    };
    const api = setup(stateFrom([status(), ...nudge(move)]));
    const card = view.getByTestId("move");

    fireEvent.click(within(card).getByRole("button", { name: "Not useful" }));
    await act(async () => {
      fireEvent.click(
        within(card).getByRole("button", { name: "Already handled" }),
      );
    });

    expect(api.feedback).toHaveBeenCalledWith({
      category: "pushback",
      useful: false,
      reason: "already_handled",
      momentId: "session-b:321000",
    });
  });

  test("Copy puts only the words of the line on the clipboard, then says Copied", async () => {
    const writeText = clipboard();
    setup(stateFrom([status(), ...nudge(PUSHBACK)]));
    const card = view.getByTestId("move");
    await act(async () => {
      fireEvent.click(
        within(card).getByRole("button", { name: "Copy the line" }),
      );
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toBe(PUSHBACK.line);
    expect(within(card).getByRole("button", { name: "Copied" })).toBeTruthy();
  });

  test("an Arabic line and quote each carry their own direction; a move without watch-out, moment or time leaves no stray separators", () => {
    const arabic: Move = {
      tag: MoveTag.VaguePromise,
      headline: "Pin the date",
      verb: MoveVerb.Say,
      line: "تمام، نتفق إن عمر يبعت الأرقام يوم الخميس؟",
      moment: { speaker: "عمر", quote: "هنبعتلكم الأرقام قريب إن شاء الله" },
    };
    setup(stateFrom([status(), ...nudge(arabic)]));
    const card = view.getByTestId("move");
    expect(within(card).getByText("Vague promise")).toBeTruthy();
    expect(within(card).getByText(arabic.line).getAttribute("dir")).toBe(
      "auto",
    );
    const moment = within(card).getByTestId("move-moment");
    expect(within(moment).getByText("عمر").tagName).toBe("BDI");
    expect(moment.textContent).not.toContain("·");
    expect(within(card).queryByTestId("move-watch-out")).toBeNull();

    const { moment: _moment, watch_out: _watch, ...bare } = PUSHBACK;
    view.unmount();
    setup(stateFrom([status(), ...nudge(bare)]));
    expect(
      within(view.getByTestId("move")).queryByTestId("move-moment"),
    ).toBeNull();
  });

  test("a direct answer keeps its facts as text above the move", () => {
    setup(
      stateFrom([
        status(),
        {
          type: CoachEventType.User,
          kind: TurnKind.Ask,
          text: "What should I say?",
        },
        {
          type: CoachEventType.Text,
          delta: "The budget is **€40k** for this quarter.",
        },
        {
          type: CoachEventType.Block,
          id: "m2",
          block: { kind: BlockKind.Move, ...PUSHBACK },
        },
        done,
      ]),
    );
    const answer = view.getByRole("article", { name: "Question and answer" });
    const text = within(answer).getByText("€40k");
    const card = within(answer).getByTestId("move");
    expect(
      text.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe("the talk-time meter", () => {
  test("a talk-time nudge shows each speaker's share with the user marked, the longest stretch and the user's questions", () => {
    const move: Move = { ...PUSHBACK, tag: MoveTag.TalkTime };
    setup(
      stateFrom([
        status(),
        ...nudge(move, [{ type: CoachEventType.Talk, talk: TALK }]),
      ]),
    );
    const meter = view.getByRole("group", { name: "Talk time, last 7 min" });
    const shares = within(meter).getAllByTestId("talk-share");
    expect(shares.map((share) => share.textContent)).toEqual([
      "You74%",
      "Marco16%",
      "Sara10%",
    ]);
    expect(shares[0]?.getAttribute("data-you")).toBe("true");
    expect(shares[1]?.getAttribute("data-you")).toBeNull();
    expect(within(meter).getByText("Longest stretch 03:05")).toBeTruthy();
    expect(within(meter).getByText("You asked 1 question")).toBeTruthy();
    const segments = within(meter).getAllByTestId("talk-segment");
    expect(segments.map((segment) => segment.style.flexGrow)).toEqual([
      "296000",
      "64000",
      "40000",
    ]);
  });

  test("twelve speakers fold into the top two others plus the rest; a silent user reads 0% and asks no questions", () => {
    const talk: TalkStats = {
      spanMs: 3_600_000,
      totalMs: 3_400_000,
      speakers: [
        ...Array.from({ length: 11 }, (_, index) => ({
          speaker: `Speaker ${index + 1}`,
          ms: [1_000_000, 600_000][index] ?? 200_000,
        })),
      ],
      youLongestMs: 0,
      youQuestions: 0,
    };
    setup(
      stateFrom([
        status(),
        {
          type: CoachEventType.User,
          kind: TurnKind.Catchup,
          text: "Catch me up · 15:00",
        },
        { type: CoachEventType.Talk, talk },
        done,
      ]),
    );
    const meter = view.getByRole("group", { name: "Talk time, last 60 min" });
    expect(
      within(meter)
        .getAllByTestId("talk-share")
        .map((share) => share.textContent),
    ).toEqual(["You0%", "Speaker 129%", "Speaker 218%", "9 others53%"]);
    expect(within(meter).getAllByTestId("talk-segment")).toHaveLength(3);
    expect(within(meter).getByText("You asked no questions")).toBeTruthy();
  });

  test("a user who did all the talking fills the bar", () => {
    const talk: TalkStats = {
      spanMs: 120_000,
      totalMs: 120_000,
      speakers: [{ speaker: "You", ms: 120_000 }],
      youLongestMs: 120_000,
      youQuestions: 3,
    };
    setup(
      stateFrom([
        status(),
        {
          type: CoachEventType.User,
          kind: TurnKind.Catchup,
          text: "Catch me up · 15:00",
        },
        { type: CoachEventType.Talk, talk },
        done,
      ]),
    );
    const meter = view.getByRole("group", { name: "Talk time, last 2 min" });
    expect(
      within(meter)
        .getAllByTestId("talk-share")
        .map((share) => share.textContent),
    ).toEqual(["You100%"]);
    expect(within(meter).getByText("You asked 3 questions")).toBeTruthy();
  });
});

const COACHING: WrapUp["coaching"] = {
  went_well: [
    "You asked Marco what was driving the budget gap.",
    "You named an owner for the pilot.",
  ],
  next_time: [
    {
      moment: {
        speaker: "Marco",
        at: "12:40",
        quote: "That's more than we budgeted",
      },
      headline: "Ask what's behind it before defending",
      verb: MoveVerb.Ask,
      line: "Price aside, is this the solution you want?",
    },
    {
      moment: { speaker: "سارة", at: null, quote: "نشوف الموضوع ده بعدين" },
      headline: "Pin the next step",
      verb: MoveVerb.Say,
      line: "نحجز ربع ساعة يوم الثلاثاء نراجع فيها الإعدادات؟",
    },
  ],
};

const ended = (talk: TalkStats | null): CoachEvent[] => {
  const wrapUp: WrapUpView = {
    state: WrapUpState.Ready,
    title: "Pricing review",
    wrapUp: {
      commitments: [],
      open_questions: [],
      follow_up_draft: "",
      coaching: COACHING,
    },
    commitments: [],
    actions: {
      addActionItems: { enabled: false, hint: null },
      logToClients: { enabled: false, hint: null },
    },
    added: false,
    logged: false,
    talk,
  };
  return [
    status({ meeting: false }),
    {
      type: CoachEventType.Transcript,
      strip: {
        state: StripState.Waiting,
        lastTitle: "Pricing review",
        endedAt: null,
      },
      lines: [],
      pending: "",
    },
    { type: CoachEventType.Wrapup, wrapUp },
  ];
};

describe("wrap-up coaching", () => {
  test("went well items carry a check; each next-time card quotes the moment, then the line to use instead with Copy", async () => {
    const writeText = clipboard();
    setup(stateFrom(ended(TALK)));
    const card = view.getByTestId("wrap-up");
    const well = within(card).getByRole("list", { name: "Went well" });
    expect(within(well).getAllByRole("listitem")).toHaveLength(2);
    expect(within(well).getAllByTestId("went-well-check")).toHaveLength(2);

    const next = within(card).getByRole("list", { name: "Next time" });
    const [first, second] = within(next).getAllByRole("listitem");
    if (!first || !second) throw new Error("expected two next-time cards");
    expect(
      within(first).getByText("That's more than we budgeted"),
    ).toBeTruthy();
    expect(within(first).getByText("Marco")).toBeTruthy();
    expect(within(first).getByText("12:40")).toBeTruthy();
    expect(
      within(first).getByText("Ask what's behind it before defending"),
    ).toBeTruthy();
    expect(
      within(within(first).getByTestId("move-line")).getByText("Ask"),
    ).toBeTruthy();
    expect(
      within(second)
        .getByText("نحجز ربع ساعة يوم الثلاثاء نراجع فيها الإعدادات؟")
        .getAttribute("dir"),
    ).toBe("auto");
    expect(within(second).getByTestId("move-moment").textContent).not.toContain(
      "·",
    );

    await act(async () => {
      fireEvent.click(
        within(second).getByRole("button", { name: "Copy the line" }),
      );
    });
    expect(writeText.mock.calls[0]?.[0]).toBe(
      "نحجز ربع ساعة يوم الثلاثاء نراجع فيها الإعدادات؟",
    );
  });

  test("a post-meeting coaching quote opens its own session at the cited time", async () => {
    const api = setup(
      stateFrom(
        ended(null).map((event) =>
          event.type === CoachEventType.Wrapup &&
          event.wrapUp?.state === WrapUpState.Ready
            ? {
                ...event,
                wrapUp: { ...event.wrapUp, sessionId: "session-wrap" },
              }
            : event,
        ),
      ),
    );
    const card = view.getByTestId("wrap-up");
    fireEvent.click(
      within(card).getByRole("button", { name: "Open transcript at 12:40" }),
    );

    expect(api.openEvidence).toHaveBeenCalledWith({
      sessionId: "session-wrap",
      timestampMs: 760_000,
    });
  });

  test("the whole meeting's talk time sits in the card when there was enough talk, and is absent otherwise", () => {
    setup(stateFrom(ended(TALK)));
    const meter = within(view.getByTestId("wrap-up")).getByRole("group", {
      name: "Talk time, whole meeting",
    });
    expect(within(meter).getAllByTestId("talk-share")).toHaveLength(3);
    view.unmount();
    setup(stateFrom(ended(null)));
    expect(
      within(view.getByTestId("wrap-up")).getByRole("list", {
        name: "Next time",
      }),
    ).toBeTruthy();
    expect(
      within(view.getByTestId("wrap-up")).queryByRole("group", {
        name: /Talk time/,
      }),
    ).toBeNull();
  });
});

describe("history", () => {
  test("a nudge's move and its talk-time meter come back after a reload from the saved chat", () => {
    const events = [
      status(),
      ...nudge({ ...PUSHBACK, tag: MoveTag.TalkTime }, [
        { type: CoachEventType.Talk, talk: TALK },
      ]),
    ];
    const history = events.reduce<CoachEvent[]>(appendHistory, []);
    const file = join(
      mkdtempSync(join(tmpdir(), "coach-coaching-")),
      "chats.json",
    );
    saveChats(
      file,
      remember(emptyStore(), "m1", {
        runtimeSessionId: "c1",
        project: "/p",
        history,
        updatedAt: 1,
      }),
    );
    const restored = loadChats(file).meetings.m1?.history ?? [];
    expect(
      restored.filter(
        (event) =>
          event.type === CoachEventType.Block ||
          event.type === CoachEventType.Talk,
      ),
    ).toHaveLength(2);
    setup(stateFrom([status(), ...restored]));
    const card = view.getByTestId("move");
    expect(within(card).getByText("Talk time")).toBeTruthy();
    expect(within(card).getByText(PUSHBACK.line)).toBeTruthy();
    expect(
      view.getByRole("group", { name: "Talk time, last 7 min" }),
    ).toBeTruthy();
  });
});
