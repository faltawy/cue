import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { BlockKind } from "@anlg/assistant/blocks";
import { MeetingIntent } from "@anlg/assistant/coaching-preferences";
import { meetingChange } from "@anlg/assistant/meeting-state";
import { FeedbackReason, MoveTag, MoveVerb } from "@anlg/assistant/move";
import {
  type CoachEvent,
  CoachEventType,
  ResetReason,
  TurnKind,
  WrapUpState,
} from "@anlg/assistant/protocol";
import { CoachProvider } from "@anlg/assistant/provider";

import {
  type ChatStore,
  clearFeedback,
  coachingFor,
  deferCoaching,
  dropResume,
  emptyStore,
  feedbackPreferences,
  keepWrapUp,
  loadChats,
  MAX_MEETINGS,
  planChat,
  prioritizeHitsByFeedback,
  recordFeedback,
  remember,
  resumeFor,
  ResumeReason,
  saveChats,
  saveFeedback,
  setMeetingCoaching,
  type SettledWrapUp,
  wrappedTranscripts,
} from "./chat-store";
import { HitKind } from "./detect";

const asked: CoachEvent[] = [
  { type: CoachEventType.User, kind: TurnKind.Ask, text: "What did Sara ask?" },
  { type: CoachEventType.Text, delta: "About the Bcc option." },
];

function storeWith(
  meeting: string,
  project: string,
  runtimeSessionId = "claude-1",
): ChatStore {
  return remember(emptyStore(), meeting, {
    runtimeSessionId,
    project,
    history: asked,
    updatedAt: 1,
  });
}

describe("resumeFor", () => {
  const store = storeWith("meeting-a", "/work/northwind");

  test("resumes the meeting's chat when the same meeting is still recording in the same project", () => {
    expect(
      resumeFor(
        store,
        { sessionId: "meeting-a", live: true },
        "/work/northwind",
      )?.runtimeSessionId,
    ).toBe("claude-1");
  });

  test.each([
    [
      "the meeting ended",
      { sessionId: "meeting-a", live: false },
      "/work/northwind",
    ],
    [
      "another meeting",
      { sessionId: "meeting-b", live: true },
      "/work/northwind",
    ],
    [
      "the series now uses another folder",
      { sessionId: "meeting-a", live: true },
      "/work/clients",
    ],
    ["no meeting", null, "/work/northwind"],
  ] as const)("starts fresh when %s", (_case, meeting, project) => {
    expect(resumeFor(store, meeting, project)).toBeNull();
  });
});

describe("planChat", () => {
  const store = storeWith("meeting-a", "/work/northwind");
  const live = { sessionId: "meeting-a", live: true };
  const current = {
    runtimeSessionId: "claude-live",
    project: "/work/northwind",
    history: asked,
  };

  test("after a restart mid-meeting, the coach resumes with its history", () => {
    const plan = planChat({
      reason: ResumeReason.Startup,
      store,
      meeting: live,
      project: "/work/northwind",
      current,
    });
    expect(plan.resume).toBe("claude-1");
    expect(plan.history).toEqual(asked);
  });

  test("New chat forgets the meeting's chat, so a later restart doesn't bring it back", () => {
    const plan = planChat({
      reason: ResetReason.Manual,
      store,
      meeting: live,
      project: "/work/northwind",
      current,
    });
    expect(plan).toMatchObject({
      store: emptyStore(),
      resume: null,
      history: [],
    });
    expect(
      planChat({
        reason: ResumeReason.Startup,
        store: plan.store,
        meeting: live,
        project: "/work/northwind",
        current,
      }).resume,
    ).toBeNull();
  });

  test("recovering without a resumable session starts fresh but keeps what the user already sees", () => {
    const plan = planChat({
      reason: ResumeReason.Recover,
      store,
      meeting: live,
      project: "/work/northwind",
      current: { ...current, runtimeSessionId: null },
    });
    expect(plan.resume).toBeNull();
    expect(plan.history).toBe(asked);
    const moved = planChat({
      reason: ResumeReason.Recover,
      store,
      meeting: live,
      project: "/work/elsewhere",
      current,
    });
    expect(moved).toMatchObject({ store, resume: null, history: [] });
  });

  test("recovering from a crash continues the current chat, not the stored one", () => {
    const plan = planChat({
      reason: ResumeReason.Recover,
      store,
      meeting: live,
      project: "/work/northwind",
      current,
    });
    expect(plan.resume).toBe("claude-live");
    expect(plan.history).toBe(asked);
  });
});

describe("after the app restarts", () => {
  const nudged: CoachEvent[] = [
    {
      type: CoachEventType.User,
      kind: TurnKind.Nudge,
      text: "Open question · 11:02",
    },
    {
      type: CoachEventType.Block,
      id: "move-1",
      block: {
        kind: BlockKind.Move,
        tag: MoveTag.OpenQuestion,
        headline: "Pin the renewal date",
        verb: MoveVerb.Ask,
        line: "When do you renew?",
      },
    },
    {
      type: CoachEventType.Done,
      seconds: 4,
      ok: true,
      silent: false,
      interrupted: false,
    },
  ];
  const ready: SettledWrapUp = {
    state: WrapUpState.Ready,
    title: "Northwind renewal",
    wrapUp: {
      commitments: [
        { who: "You", what: "Send the renewal quote", when: "Friday" },
      ],
      open_questions: ["Who signs off on the budget?"],
      follow_up_draft: "Thanks for the time today.",
      coaching: { went_well: [], next_time: [] },
    },
    commitments: ["You: Send the renewal quote (Friday)"],
    actions: {
      addActionItems: { enabled: true, hint: null },
      logToClients: { enabled: false, hint: "Add a tool" },
    },
    added: true,
    logged: false,
    talk: null,
  };
  const project = "/work/northwind";
  const current = { runtimeSessionId: null, project, history: [] };
  const live = { sessionId: "meeting-a", live: true };
  const ended = { ...live, live: false };

  function restarted(store: ChatStore): ChatStore {
    const file = path.join(
      mkdtempSync(path.join(os.tmpdir(), "coach-chats-")),
      "coach-chats.json",
    );
    saveChats(file, store);
    return loadChats(file);
  }

  function reopen(
    store: ChatStore,
    meeting: { sessionId: string; live: boolean },
  ) {
    return planChat({
      reason: ResumeReason.Startup,
      store,
      meeting,
      project,
      current,
    });
  }

  test("a chat with only nudges, never asked anything, keeps its nudges", () => {
    const store = restarted(
      remember(emptyStore(), "meeting-a", {
        runtimeSessionId: null,
        project,
        history: nudged,
        updatedAt: 1,
      }),
    );
    const plan = reopen(store, ended);
    expect(plan.history).toEqual(nudged);
    expect(plan.resume).toBeNull();
  });

  test("a finished wrap-up comes back with its meeting and is not generated again", () => {
    const store = restarted(
      keepWrapUp(emptyStore(), "meeting-a", {
        transcriptId: "t1",
        view: ready,
        updatedAt: 1,
      }),
    );
    expect(reopen(store, ended).wrapUp).toEqual({
      transcriptId: "t1",
      view: ready,
      updatedAt: 1,
    });
    expect(
      reopen(store, { sessionId: "meeting-b", live: false }).wrapUp,
    ).toBeUndefined();

    const recording = {
      sessionId: "meeting-a",
      transcriptId: "t1",
      live: true,
    };
    const stopped = { ...recording, live: false };
    expect(meetingChange(recording, stopped, new Set()).wrapUp).toBe(true);
    expect(
      meetingChange(recording, stopped, wrappedTranscripts(store)).wrapUp,
    ).toBe(false);
  });

  test("New chat dismisses the saved wrap-up across restarts without losing it or replaying it live", () => {
    const saved = { transcriptId: "t1", view: ready, updatedAt: 1 };
    const store = restarted(keepWrapUp(emptyStore(), "meeting-a", saved));
    expect(reopen(store, ended).wrapUp?.view).toEqual(ready);
    const plan = planChat({
      reason: ResetReason.Manual,
      store,
      meeting: ended,
      project,
      current,
    });
    expect(plan.wrapUp).toBeUndefined();
    expect(plan.store.wrapUps["meeting-a"]?.view).toEqual(ready);
    expect(reopen(restarted(plan.store), ended).wrapUp).toBeUndefined();

    const updated = keepWrapUp(plan.store, "meeting-a", {
      ...saved,
      view: { ...ready, logged: true },
    });
    expect(updated.wrapUps["meeting-a"]?.view).toMatchObject({ logged: true });
    expect(reopen(restarted(updated), ended).wrapUp).toBeUndefined();
    expect(wrappedTranscripts(updated).has("t1")).toBe(true);
    expect(reopen(store, live).wrapUp).toBeUndefined();

    const nextRecording = keepWrapUp(updated, "meeting-a", {
      ...saved,
      transcriptId: "t2",
    });
    expect(reopen(nextRecording, ended).wrapUp?.transcriptId).toBe("t2");
  });

  test("a chat with a resumable session resumes it with its history", () => {
    const plan = reopen(restarted(storeWith("meeting-a", project)), live);
    expect(plan.resume).toBe("claude-1");
    expect(plan.history).toEqual(asked);
  });

  test("a chat whose session Claude Code lost starts a fresh session but keeps what the user saw", () => {
    const seen = {
      id: "meeting-a",
      title: "Northwind renewal",
      live: true,
      elsewhere: null,
    };
    const stored = remember(emptyStore(), "meeting-a", {
      runtimeSessionId: "claude-1",
      project,
      history: asked,
      updatedAt: 1,
      seen,
    });
    expect(reopen(restarted(stored), live).seen).toEqual(seen);

    const plan = reopen(restarted(dropResume(stored, "meeting-a")), live);
    expect(plan.resume).toBeNull();
    expect(plan.history).toEqual(asked);
    expect(plan.seen).toBeUndefined();
  });
});

describe("local nudge feedback", () => {
  test("poor timing changes interruption preferences without penalizing useful subject matter", () => {
    const seeded = recordFeedback(emptyStore(), {
      category: MoveTag.Pushback,
      useful: true,
    });
    const updated = recordFeedback(seeded, {
      category: MoveTag.Pushback,
      useful: false,
      reason: FeedbackReason.PoorTiming,
    });
    expect(feedbackPreferences(updated).categories.pushback).toBe(1);
    expect(updated.feedback.carefulTiming).toBe(true);
    expect(clearFeedback(updated).feedback.carefulTiming).toBe(false);
  });

  test("meeting intention, quiet mode and deferred observations survive restart without leaking to another meeting", () => {
    const file = path.join(
      mkdtempSync(path.join(os.tmpdir(), "cue-coaching-")),
      "chats.json",
    );
    const seeded = setMeetingCoaching(
      storeWith("meeting-a", "/work/northwind"),
      "meeting-a",
      { intent: MeetingIntent.Presenting, quiet: true },
    );
    const deferred = deferCoaching(
      seeded,
      "meeting-a",
      "The rollout plan is due Friday.",
    );
    saveChats(file, deferred);
    const loaded = loadChats(file);
    expect(loaded.meetings["meeting-a"]?.runtimeSessionId).toBe("claude-1");
    expect(coachingFor(loaded, "meeting-a")).toMatchObject({
      intent: "presenting",
      quiet: true,
      deferred: ["The rollout plan is due Friday."],
    });
    expect(coachingFor(loaded, "meeting-b")).toMatchObject({
      intent: "general",
      quiet: false,
      deferred: [],
    });
    expect(
      coachingFor(
        setMeetingCoaching(loaded, "meeting-a", { quiet: false }),
        "meeting-a",
      ),
    ).toMatchObject({
      intent: "presenting",
      quiet: false,
      deferred: ["The rollout plan is due Friday."],
    });
  });

  test("positive and negative category signals reorder competing transcript cues locally", () => {
    const seeded = recordFeedback(
      recordFeedback(storeWith("meeting-a", "/work/northwind"), {
        category: MoveTag.Pushback,
        useful: true,
      }),
      { category: MoveTag.OpenQuestion, useful: false },
    );
    const hits = [
      { kind: HitKind.Question, lineIndex: 1, text: "Can you confirm?" },
      { kind: HitKind.Objection, lineIndex: 2, text: "Too expensive." },
    ];

    expect(prioritizeHitsByFeedback(seeded, hits)).toEqual([
      hits[0]!,
      hits[1]!,
    ]);
  });

  test("places a downvoted cue before an unscored cue so the prompt cap drops it first", () => {
    const seeded = recordFeedback(storeWith("meeting-a", "/work/northwind"), {
      category: MoveTag.OpenQuestion,
      useful: false,
    });
    const question = {
      kind: HitKind.Question,
      lineIndex: 1,
      text: "Can you confirm?",
    };
    const monologue = {
      kind: HitKind.Monologue,
      lineIndex: 2,
      text: "Let me explain.",
    };

    expect(prioritizeHitsByFeedback(seeded, [question, monologue])).toEqual([
      question,
      monologue,
    ]);
  });

  test("stores category preference and suppresses an already-handled moment across restart", () => {
    const directory = mkdtempSync(
      path.join(os.tmpdir(), "cue-coach-feedback-"),
    );
    const file = path.join(directory, "coach-chats.json");
    const seeded = storeWith("meeting-a", "/work/northwind");
    const updated = recordFeedback(seeded, {
      category: MoveTag.Pushback,
      useful: true,
    });
    const withHandledMoment = recordFeedback(updated, {
      category: MoveTag.OpenQuestion,
      useful: false,
      reason: FeedbackReason.AlreadyHandled,
      momentId: "meeting-a:65000:open_question",
    });
    saveChats(file, withHandledMoment);
    const reloaded = loadChats(file);

    expect(reloaded.meetings["meeting-a"]?.runtimeSessionId).toBe("claude-1");
    expect(feedbackPreferences(reloaded)).toEqual({
      categories: { pushback: 1, open_question: -1 },
      handledMoments: ["meeting-a:65000:open_question"],
      carefulTiming: false,
    });
  });

  test("reset clears feedback signals but keeps saved coach chats", () => {
    const seeded = recordFeedback(storeWith("meeting-a", "/work/northwind"), {
      category: MoveTag.Pushback,
      useful: true,
    });
    const reset = clearFeedback(seeded);

    expect(reset.meetings["meeting-a"]?.runtimeSessionId).toBe("claude-1");
    expect(feedbackPreferences(reset)).toEqual({
      categories: {},
      handledMoments: [],
      carefulTiming: false,
    });
  });
});

describe("remember", () => {
  test("skips a chat with nothing to show and nothing to resume", () => {
    const chat = { runtimeSessionId: null, project: "/p", updatedAt: 1 };
    expect(
      remember(emptyStore(), "meeting-a", { ...chat, history: [] }).meetings,
    ).toEqual({});
    expect(
      Object.keys(
        remember(emptyStore(), "meeting-a", { ...chat, history: asked })
          .meetings,
      ),
    ).toEqual(["meeting-a"]);
  });

  test("keeps the newest wrap-ups only", () => {
    let store = emptyStore();
    const view = {
      state: WrapUpState.Failed,
      title: null,
      message: "Claude Code timed out",
    } as const;
    for (let index = 0; index < MAX_MEETINGS + 5; index += 1) {
      store = keepWrapUp(store, `m${index}`, {
        transcriptId: `t${index}`,
        view,
        updatedAt: index,
      });
    }
    const kept = Object.keys(store.wrapUps);
    expect(kept).toHaveLength(MAX_MEETINGS);
    expect(kept).toContain(`m${MAX_MEETINGS + 4}`);
    expect(kept).not.toContain("m0");
  });

  test("keeps the newest meetings only", () => {
    let store = emptyStore();
    for (let index = 0; index < MAX_MEETINGS + 5; index += 1) {
      store = remember(store, `m${index}`, {
        runtimeSessionId: `c${index}`,
        project: "/p",
        history: [],
        updatedAt: index,
      });
    }
    const kept = Object.keys(store.meetings);
    expect(kept).toHaveLength(MAX_MEETINGS);
    expect(kept).toContain(`m${MAX_MEETINGS + 4}`);
    expect(kept).not.toContain("m0");
  });
});

describe("the chat file", () => {
  test("round-trips, is private to the user, and an unreadable file starts empty", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "coach-chats-"));
    const file = path.join(dir, "nested", "coach-chats.json");
    const store = storeWith("meeting-a", "/work/northwind");
    saveChats(file, store);
    expect(loadChats(file)).toEqual(store);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(readFileSync(file, "utf8")).meetings["meeting-a"]
        .runtimeSessionId,
    ).toBe("claude-1");

    writeFileSync(file, "{not json");
    expect(loadChats(file)).toEqual(emptyStore());
    expect(loadChats(path.join(dir, "missing.json"))).toEqual(emptyStore());
  });
});

test("provider changes keep existing chats on their original runtime, while New chat uses the selection", () => {
  const file = path.join(
    mkdtempSync(path.join(os.tmpdir(), "coach-provider-")),
    "chats.json",
  );
  writeFileSync(
    file,
    JSON.stringify({
      meetings: {
        m1: {
          claudeSessionId: "old-claude",
          project: "/p",
          history: asked,
          updatedAt: 1,
        },
      },
    }),
  );
  const legacy = loadChats(file);
  const input = {
    reason: ResumeReason.Startup,
    store: legacy,
    meeting: { sessionId: "m1", live: true },
    project: "/p",
    selected: { provider: CoachProvider.Codex, model: "" },
    current: { runtimeSessionId: null, project: "/p", history: [] },
  };
  const restored = planChat(input);
  expect(restored.resume).toBe("old-claude");
  expect(restored.history).toEqual(asked);
  expect(restored.provider).toBe(CoachProvider.Claude);
  expect(restored.model).toBe("sonnet");
  const fresh = planChat({ ...input, reason: ResetReason.Manual });
  expect(fresh.provider).toBe(CoachProvider.Codex);
  expect(fresh.model).toBe("");
  expect(fresh.resume).toBeNull();
  const codex = remember(fresh.store, "m1", {
    runtimeSessionId: "codex-thread",
    provider: CoachProvider.Codex,
    model: "gpt-test",
    project: "/p",
    history: asked,
    updatedAt: 2,
  });
  saveChats(file, codex);
  const reloaded = planChat({
    ...input,
    store: loadChats(file),
    selected: { provider: CoachProvider.Claude, model: "opus" },
  });
  expect(reloaded.resume).toBe("codex-thread");
  expect(reloaded.provider).toBe(CoachProvider.Codex);
  expect(reloaded.model).toBe("gpt-test");
});

test("legacy chats and existing provider chats use that provider's current model preference", () => {
  const file = path.join(
    mkdtempSync(path.join(os.tmpdir(), "coach-model-")),
    "chats.json",
  );
  writeFileSync(
    file,
    JSON.stringify({
      meetings: {
        m1: {
          claudeSessionId: "old-claude",
          project: "/p",
          history: asked,
          updatedAt: 1,
        },
      },
    }),
  );
  const store = loadChats(file);
  const input = {
    reason: ResumeReason.Startup,
    store,
    meeting: { sessionId: "m1", live: true },
    project: "/p",
    selected: {
      provider: CoachProvider.Codex,
      model: "",
      models: { claude: "opus", codex: "" },
    },
    current: { runtimeSessionId: null, project: "/p", history: [] },
  };
  expect(planChat(input)).toMatchObject({
    provider: CoachProvider.Claude,
    model: "opus",
    resume: "old-claude",
    history: asked,
  });
  const saved = remember(store, "m1", {
    runtimeSessionId: "old-claude",
    provider: CoachProvider.Claude,
    model: "sonnet",
    project: "/p",
    history: asked,
    updatedAt: 2,
  });
  expect(planChat({ ...input, store: saved })).toMatchObject({
    provider: CoachProvider.Claude,
    model: "opus",
    resume: "old-claude",
  });
});

test("a failed feedback save leaves the previous vote intact and a retry counts it only once", () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "cue-feedback-failure-"),
  );
  const file = path.join(directory, "chats.json");
  let store = saveFeedback(file, emptyStore(), {
    category: MoveTag.Pushback,
    useful: true,
  });
  writeFileSync(path.join(directory, "blocked"), "not a directory");
  expect(() => {
    store = saveFeedback(path.join(directory, "blocked", "chats.json"), store, {
      category: MoveTag.Pushback,
      useful: true,
    });
  }).toThrow(/EEXIST|ENOTDIR/);
  expect(store.feedback.categories.pushback).toBe(1);
  expect(loadChats(file).feedback.categories.pushback).toBe(1);
  store = saveFeedback(file, store, {
    category: MoveTag.Pushback,
    useful: true,
  });
  expect(store.feedback.categories.pushback).toBe(2);
  expect(loadChats(file).feedback.categories.pushback).toBe(2);
});

test("library chat survives meeting changes and resets without erasing the live coach", () => {
  const store = remember(
    storeWith("meeting-a", "/work/northwind", "live-runtime"),
    "cue:library",
    {
      runtimeSessionId: "library-runtime",
      project: "/work/northwind",
      history: [
        {
          type: CoachEventType.User,
          kind: TurnKind.Ask,
          text: "Organize my notes",
        },
        { type: CoachEventType.Text, delta: "Which folder?" },
      ],
      updatedAt: 2,
    },
  );
  const input = {
    reason: ResumeReason.Startup,
    store,
    conversationId: "cue:library",
    meeting: { sessionId: "meeting-a", live: true },
    project: "/work/northwind",
    current: {
      runtimeSessionId: null,
      project: "/work/northwind",
      history: [],
    },
  };
  const resumed = planChat(input);
  expect(resumed.resume).toBe("library-runtime");
  expect(resumed.history[1]).toEqual({
    type: CoachEventType.Text,
    delta: "Which folder?",
  });
  const reset = planChat({ ...input, reason: ResetReason.Manual });
  expect(reset.history).toEqual([]);
  const live = planChat({
    ...input,
    store: reset.store,
    conversationId: undefined,
  });
  expect(live.resume).toBe("live-runtime");
  expect(live.history[1]).toEqual({
    type: CoachEventType.Text,
    delta: "About the Bcc option.",
  });
});
