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

import { CoachEditKind } from "@anlg/assistant/app-bridge";
import { BlockKind } from "@anlg/assistant/blocks";
import { IMAGE_ERRORS } from "@anlg/assistant/image-limits";
import {
  type CoachEvent,
  CoachEventType,
  ResetReason,
  TurnKind,
} from "@anlg/assistant/protocol";
import { CoachView } from "@anlg/assistant/ui/app";
import {
  ActionType,
  type CoachState,
  Connection,
  initialState,
  reduce,
} from "@anlg/assistant/ui/state";
import { type ActionResult, type CoachApi } from "@anlg/assistant/ui/use-coach";

import { emptyStore, loadChats, remember, saveChats } from "../chat-store";
import { SourceKind } from "../sources";
import { useDom } from "./dom-setup";
import { status } from "./fixtures";

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
    openEvidence: mock(ok),
    feedback: mock(ok),
    resetFeedback: mock(ok),
    setCoaching: mock(ok),
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
  view = render(<CoachView state={state} api={api} />);
  return api;
}

const done: CoachEvent = {
  type: CoachEventType.Done,
  seconds: 2,
  ok: true,
  silent: false,
  interrupted: false,
};
const THUMB = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";

const answered = (
  extra: CoachEvent[],
  text = "What did we promise?",
): CoachEvent[] => [
  { type: CoachEventType.User, kind: TurnKind.Ask, text },
  { type: CoachEventType.Text, delta: "Two promises so far." },
  ...extra,
  done,
];

const checklist: CoachEvent = {
  type: CoachEventType.Block,
  id: "b1",
  block: {
    kind: BlockKind.Actions,
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
      "You: send the Bcc setup steps · today",
      "Sara: confirm the CRM dropbox address",
    ]);

    fireEvent.click(within(rows[0] ?? block).getByRole("checkbox"));
    expect(api.checkItem).toHaveBeenCalledWith("b1", 0, true);
    await act(async () => {
      fireEvent.click(
        within(rows[1] ?? block).getByRole("button", { name: "Add to note" }),
      );
    });
    expect(api.addItemToNote).toHaveBeenCalledWith("b1", 1);

    view.unmount();
    const after = stateFrom([
      status(),
      ...answered([checklist]),
      { type: CoachEventType.BlockCheck, id: "b1", index: 0, checked: true },
      {
        type: CoachEventType.Edit,
        edit: {
          id: "e9",
          session_id: "m1",
          kind: CoachEditKind.AddActionItem,
          summary: "Sara: confirm the CRM dropbox address",
          task_id: "t9",
        },
        block: { id: "b1", index: 1 },
      },
    ]);
    const next = setup(after);
    const [first, second] = within(
      view.getByTestId("actions-block"),
    ).getAllByTestId("action-item");
    expect(
      within(first ?? document.body)
        .getByRole("checkbox")
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(within(second ?? document.body).getByText("In notes")).toBeTruthy();
    expect(
      within(second ?? document.body).queryByRole("button", {
        name: "Add to note",
      }),
    ).toBeNull();
    expect(view.queryAllByTestId("coach-edit")).toHaveLength(0);
    fireEvent.click(
      within(second ?? document.body).getByRole("button", { name: "Undo" }),
    );
    expect(next.undo).toHaveBeenCalledWith("e9");
  });

  test("Add to note is offered only when the coach is attached to a meeting in the app", () => {
    setup(
      stateFrom([status({ appConnected: false }), ...answered([checklist])]),
    );
    expect(view.getAllByTestId("action-item")).toHaveLength(2);
    expect(view.queryByRole("button", { name: "Add to note" })).toBeNull();
  });

  test("a long checklist shows the first eight with Show all", () => {
    const items = Array.from({ length: 30 }, (_, index) => ({
      text: `item ${index + 1}`,
    }));
    setup(
      stateFrom([
        status(),
        ...answered([
          {
            type: CoachEventType.Block,
            id: "b2",
            block: { kind: BlockKind.Actions, items },
          },
        ]),
      ]),
    );
    expect(view.getAllByTestId("action-item")).toHaveLength(8);
    fireEvent.click(view.getByRole("button", { name: "Show all 30" }));
    expect(view.getAllByTestId("action-item")).toHaveLength(30);
  });
});

describe("follow-up chips", () => {
  const replies: CoachEvent = {
    type: CoachEventType.Block,
    id: "r1",
    block: {
      kind: BlockKind.Replies,
      options: ["Draft the reply", "Summarise for Slack"],
    },
  };

  test("tapping one sends it as the next ask, in place of the usual suggestions", async () => {
    const api = setup(stateFrom([status(), ...answered([replies])]));
    const group = view.getByRole("group", { name: "Follow-ups" });
    expect(view.queryByRole("group", { name: "Suggestions" })).toBeNull();
    await act(async () => {
      fireEvent.click(
        within(group).getByRole("button", { name: "Summarise for Slack" }),
      );
    });
    expect(api.ask).toHaveBeenCalledWith("Summarise for Slack");
  });

  test("only the latest answer offers them", () => {
    setup(
      stateFrom([
        status(),
        ...answered([replies]),
        ...answered([], "And what's still open?"),
      ]),
    );
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
            type: CoachEventType.Sources,
            sources: [
              {
                kind: SourceKind.Web,
                url: "https://help.example.com/bcc",
                label: "help.example.com",
                title: "Outbound Bcc",
              },
              {
                kind: SourceKind.Email,
                url: "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0",
                label: "Re: Bcc before renewal",
                title: "Re: Bcc before renewal",
              },
            ],
          },
        ]),
      ]),
    );
    const list = view.getByRole("list", { name: "Sources" });
    fireEvent.click(within(list).getByText("Re: Bcc before renewal"));
    expect(api.open).toHaveBeenCalledWith(
      "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0",
    );
    expect(
      within(list)
        .getByText("help.example.com")
        .closest("a")
        ?.getAttribute("title"),
    ).toBe("Outbound Bcc");
  });
});

describe("images in the composer", () => {
  test("an unsupported file is refused with plain copy and nothing is attached", () => {
    setup(stateFrom([status()]));
    const picker = view.getByTestId("image-picker");
    fireEvent.change(picker, {
      target: {
        files: [new File(["x"], "IMG_0042.HEIC", { type: "image/heic" })],
      },
    });
    expect(view.getByRole("alert").textContent).toBe(IMAGE_ERRORS.type);
    expect(view.queryAllByTestId("attachment")).toHaveLength(0);
  });

  test("a sent message keeps its thumbnails after the chat is saved and reopened", () => {
    const dir = mkdtempSync(join(tmpdir(), "coach-images-"));
    const file = join(dir, "coach-chats.json");
    const history: CoachEvent[] = [
      {
        type: CoachEventType.User,
        kind: TurnKind.Ask,
        text: "What's this error?",
        images: [
          { thumb: THUMB, width: 192, height: 108 },
          { thumb: THUMB, width: 90, height: 192 },
        ],
      },
      { type: CoachEventType.Text, delta: "A missing env var." },
      done,
    ];
    saveChats(
      file,
      remember(emptyStore(), "m1", {
        runtimeSessionId: "c1",
        project: "/work",
        history,
        updatedAt: 1,
      }),
    );
    const restored = loadChats(file).meetings.m1?.history ?? [];
    setup(
      stateFrom([
        status(),
        { type: CoachEventType.Reset, reason: ResetReason.Sync },
        ...restored,
      ]),
    );
    const images = within(view.getByTestId("sent-images")).getAllByRole("img");
    expect(
      images.map((image) => [
        image.getAttribute("src"),
        image.getAttribute("alt"),
      ]),
    ).toEqual([
      [THUMB, "Attached image 1"],
      [THUMB, "Attached image 2"],
    ]);
    expect(view.getByText("What's this error?")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Ask again" })).toBeNull();
  });
});
