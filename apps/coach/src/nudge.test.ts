import { describe, expect, spyOn, test } from "bun:test";

import { MeetingIntent } from "@anlg/assistant/coaching-preferences";
import { moveSchema, MoveTag, MoveVerb } from "@anlg/assistant/move";
import {
  estimateTokens,
  ONE_SHOT_OVERHEAD_TOKENS,
} from "@anlg/assistant/pricing";
import { CoachProvider } from "@anlg/assistant/provider";

import {
  emptyStore,
  prioritizeHitsByFeedback,
  recordFeedback,
} from "./chat-store";
import { type Hit, HitKind } from "./detect";
import {
  NUDGE_SYSTEM,
  nudgeLabel,
  nudgeMessage,
  nudgeModel,
  nudgeMove,
  nudgeNote,
  NudgeParseKind,
  type NudgeReply,
  nudgeSystem,
  parseNudge,
  rememberNote,
  withNudgeNotes,
} from "./nudge";
import { type TranscriptLine } from "./transcript";
import { TRIAGE_MODEL } from "./triage";

const line = (
  speaker: string,
  text: string,
  startS: number,
  endS = startS + 4,
): TranscriptLine => ({
  speaker,
  channel: speaker === "You" ? 0 : 1,
  start_ms: startS * 1_000,
  end_ms: endS * 1_000,
  text,
});

const QUESTION = "Can you Bcc every reply to our CRM, or only new sessions?";
const hit = (lineIndex: number, text = QUESTION): Hit => ({
  kind: HitKind.Question,
  lineIndex,
  text,
});

describe("lightweight nudge prompt", () => {
  test("uses Haiku for Claude's fast path and keeps Codex's selected model", () => {
    expect(nudgeModel({ fast: true })).toBe(TRIAGE_MODEL);
    expect(nudgeModel({ fast: false })).toBe("sonnet");
    expect(
      nudgeModel({
        provider: CoachProvider.Codex,
        model: "gpt-6-luna",
        fast: true,
      }),
    ).toBe("gpt-6-luna");
  });

  test("carries the meeting header, the flagged moment, why, and only the last 3 minutes of lines", () => {
    const lines = [
      line("Omar", "Early agenda chatter about the offsite.", 10),
      line("Sara", "We have around 40 agents and 12 team leads.", 400),
      line("Omar", QUESTION, 560),
    ];
    const message = nudgeMessage({
      context: "Rollout sync · with Omar, Sara",
      hits: [hit(2)],
      why: "open question about Bcc",
      lines,
    });
    expect(message).toBe(
      [
        "Meeting: Rollout sync · with Omar, Sara",
        "Flagged moment:",
        `- a question aimed at the user: "${QUESTION}"`,
        "Flagged because: open question about Bcc",
        "The last 3 minutes:",
        "[06:40] Sara: We have around 40 agents and 12 team leads.",
        `[09:20] Omar: ${QUESTION}`,
      ].join("\n"),
    );
  });

  test("adds the talk-time line before the excerpt once enough has been said to judge the balance", () => {
    const lines = [
      line(
        "You",
        "So let me walk you through the whole platform end to end.",
        300,
        420,
      ),
      line("Omar", "Okay.", 421, 422),
      line("You", "And then there is the reporting layer too.", 423, 480),
      line("Omar", QUESTION, 481, 490),
    ];
    const message = nudgeMessage({
      context: "Discovery call · with Omar",
      hits: [hit(3)],
      why: "open question",
      lines,
    });
    expect(message).toContain(
      "Flagged because: open question\nTalk time, last 3 min: You 95%, Omar 5% · your longest stretch 02:00 · questions you asked: 0\nThe last 3 minutes:\n",
    );
  });

  test("the fixed instructions lead the system prompt byte for byte, then the user's own instructions; no tools are named", () => {
    const system = nudgeSystem("I'm the CTO. Never promise dates.");
    expect(system.startsWith(NUDGE_SYSTEM)).toBe(true);
    expect(system).toEndWith("\nI'm the CTO. Never promise dates.");
    expect(nudgeSystem("")).toBe(NUDGE_SYSTEM);
    expect(nudgeSystem("  \n")).toBe(NUDGE_SYSTEM);
    for (const text of [
      system,
      nudgeMessage({
        context: "x",
        hits: [hit(0)],
        why: "y",
        lines: [line("Omar", QUESTION, 1)],
      }),
    ]) {
      expect(text).not.toContain("mcp__");
      expect(text).not.toContain("live_transcript");
    }
  });

  test.each([
    [
      "English",
      "We need every reply logged in the CRM before the renewal call next week. ",
    ],
    [
      "Arabic",
      "يعني الفريق كله متعود على الطريقة القديمة، محتاجين وقت شوية قبل ما نغير أي حاجة. ",
    ],
  ])(
    "%s worst case stays under 4k input tokens and keeps the newest line",
    (_, sentence) => {
      const lines = Array.from({ length: 300 }, (_, index) =>
        line(
          `Speaker ${index % 9}`,
          `${sentence.repeat(8)}${index}`,
          600 + index * 0.5,
          600 + index * 0.5 + 0.4,
        ),
      );
      const hits = [
        hit(297, sentence.repeat(20)),
        hit(298, sentence.repeat(20)),
        hit(299, sentence.repeat(20)),
      ];
      const system = nudgeSystem(sentence.repeat(200));
      const message = nudgeMessage({
        context: `${sentence.repeat(30)} · with ${Array.from({ length: 8 }, (_, index) => `Person ${index}`).join(", ")}`,
        hits,
        why: sentence.repeat(10),
        lines,
      });
      const total =
        estimateTokens(system) +
        estimateTokens(message) +
        ONE_SHOT_OVERHEAD_TOKENS;
      expect(total).toBeLessThanOrEqual(4_000);
      expect(total).toBeGreaterThan(2_500);
      expect(message).toEndWith(`${sentence.repeat(8)}299`);
      expect(system.startsWith(NUDGE_SYSTEM)).toBe(true);
    },
  );
});

describe("the nudge reply", () => {
  const MOVE: NudgeReply = {
    tag: MoveTag.Pushback,
    headline: "Ask what's behind the price concern",
    verb: MoveVerb.Ask,
    line: "Is it the total, or how it lands in this quarter's budget?",
    watch_out: "Don't discount yet",
  };

  test("a JSON move parses into a typed move, with or without the optional watch-out", () => {
    expect(parseNudge(JSON.stringify(MOVE))).toEqual({
      kind: NudgeParseKind.Move,
      reply: MOVE,
    });
    const { watch_out: _dropped, ...bare } = MOVE;
    expect(parseNudge(`\`\`\`json\n${JSON.stringify(bare)}\n\`\`\``)).toEqual({
      kind: NudgeParseKind.Move,
      reply: bare,
    });
  });

  test("NOTHING stays a silent result and logs nothing", () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    expect(parseNudge("NOTHING")).toEqual({ kind: NudgeParseKind.Nothing });
    expect(parseNudge(" NOTHING.\n")).toEqual({ kind: NudgeParseKind.Nothing });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  test("routes deferred observations separately from live moves and refuses oversized observations", () => {
    const note = "Omar committed to sending the rollout plan on Friday.";
    expect(parseNudge(JSON.stringify({ delivery: "later", note }))).toEqual({
      kind: NudgeParseKind.Later,
      note,
    });
    expect(parseNudge(JSON.stringify({ delivery: "now", ...MOVE }))).toEqual({
      kind: NudgeParseKind.Move,
      reply: MOVE,
    });
    expect(
      parseNudge(JSON.stringify({ delivery: "later", note: note.repeat(30) }))
        .kind,
    ).toBe(NudgeParseKind.Malformed);
  });

  test("drops verbose or multi-sentence live advice without truncating its meaning, across languages", () => {
    for (const line of [
      "I hear the missed update caused extra work for your team.",
      "واضح إن التأخير عطّل شغلكم، إيه أهم حاجة محتاجينها مننا دلوقتي؟",
      "这次延误增加了你们的工作量，现在最需要我们解决什么？",
      "Dr. Chen, what would make this handoff easier for your team?",
    ]) {
      expect(
        parseNudge(JSON.stringify({ delivery: "now", ...MOVE, line })),
      ).toEqual({ kind: NudgeParseKind.Move, reply: { ...MOVE, line } });
    }
    for (const line of [
      "I understand the delay. What would help?",
      `${"Please consider the impact carefully before making a commitment ".repeat(4)}today.`,
      "还".repeat(241),
    ]) {
      expect(
        parseNudge(JSON.stringify({ delivery: "now", ...MOVE, line })).kind,
      ).toBe(NudgeParseKind.Malformed);
    }
  });

  test.each([
    ["the old text shape", 'Ask what is behind it\nAsk: "Is it the total?"'],
    ["an unknown tag", JSON.stringify({ ...MOVE, tag: "objection" })],
    ["a lowercase verb", JSON.stringify({ ...MOVE, verb: "ask" })],
    [
      "no line",
      JSON.stringify({
        tag: MOVE.tag,
        headline: MOVE.headline,
        verb: MOVE.verb,
      }),
    ],
    ["a blank line", JSON.stringify({ ...MOVE, line: "   " })],
    ["a stray key", JSON.stringify({ ...MOVE, why: "they hesitated" })],
    [
      "a model-made moment",
      JSON.stringify({
        ...MOVE,
        moment: { speaker: "Sara", quote: "Too pricey" },
      }),
    ],
    ["truncated JSON", JSON.stringify(MOVE).slice(0, 60)],
  ])("drops %s and logs it, without guessing a move", (_name, reply) => {
    const logged = spyOn(console, "error").mockImplementation(() => {});
    const parsed = parseNudge(reply);
    expect(parsed.kind).toBe(NudgeParseKind.Malformed);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.[0]).toBe(
      "[coach] nudge reply was not the expected JSON; dropping it",
    );
    expect(logged.mock.calls[0]?.[1]).toMatchObject({
      reply: reply.slice(0, 300),
    });
    logged.mockRestore();
  });

  test("the move quotes the latest flagged line with its speaker and time; talk time only rides along for a talk-time move", () => {
    const lines = [
      line("You", "So the platform does all of this and also that.", 300, 420),
      line("Omar", "Early question about seats?", 421, 424),
      line("Omar", QUESTION, 481, 490),
    ];
    const input = {
      context: "Discovery",
      hits: [hit(2), hit(1, "Early question about seats?")],
      why: "open question",
      lines,
    };
    const { watch_out: _dropped, ...reply } = {
      ...MOVE,
      tag: MoveTag.OpenQuestion,
      verb: MoveVerb.Say,
    };
    expect(nudgeMove(input, reply)).toEqual({
      move: {
        ...reply,
        moment: { speaker: "Omar", quote: QUESTION, at: "08:01" },
      },
      talk: null,
    });
    const talking = nudgeMove(input, { ...reply, tag: MoveTag.TalkTime });
    expect(talking.talk?.speakers.map((entry) => entry.speaker)).toEqual([
      "You",
      "Omar",
    ]);
    expect(talking.talk?.youLongestMs).toBe(120_000);
  });

  test("an evidence target uses the exact source session and transcript offset", () => {
    const input = {
      context: "Discovery",
      sessionId: "session-a",
      hits: [hit(1)],
      why: "open question",
      lines: [
        line("Sara", "Earlier context", 460),
        line("Omar", QUESTION, 481),
      ],
    };
    const { move } = nudgeMove(input, {
      tag: MoveTag.OpenQuestion,
      headline: "Answer directly",
      verb: MoveVerb.Say,
      line: "We can do that.",
    });

    expect(move.evidence).toEqual({
      sessionId: "session-a",
      timestampMs: 481_000,
    });
  });

  test("a very long flagged line is clipped to the moment limit", () => {
    const long = `${"We need every reply logged in the CRM. ".repeat(12)}Can you do that?`;
    const input = {
      context: "x",
      hits: [hit(0, long)],
      why: "y",
      lines: [line("Sara", long, 60)],
    };
    const moment = nudgeMove(input, {
      tag: MoveTag.OpenQuestion,
      headline: "Confirm it",
      verb: MoveVerb.Say,
      line: "Yes.",
    }).move.moment;
    expect(moment?.quote).toHaveLength(300);
    expect(moment?.quote.endsWith("…")).toBe(true);
    expect(
      moveSchema.safeParse(
        nudgeMove(input, {
          tag: MoveTag.Risk,
          headline: "h",
          verb: MoveVerb.Say,
          line: "l",
        }).move,
      ).success,
    ).toBe(true);
  });
});

describe("nudge notes for the next ask", () => {
  test("a follow-up ask carries the nudges the chat never saw, newest three, each kept short", () => {
    let notes: string[] = [];
    for (const index of [1, 2, 3, 4])
      notes = rememberNote(
        notes,
        nudgeNote(`Question for you · 14:0${index}`, `Answer ${index}`),
      );
    notes = rememberNote(
      notes,
      nudgeNote(
        "Commitment · 14:09",
        `Omar sends the export\n\nnext week. ${"x".repeat(2_000)}`,
      ),
    );
    const prompt = withNudgeNotes(notes, "What did you mean by that?");
    expect(prompt).toStartWith(
      "(Since your last answer, the user also saw these automatic nudges",
    );
    expect(prompt).toEndWith("\n\nWhat did you mean by that?");
    expect(prompt).not.toContain("Answer 1");
    expect(prompt).not.toContain("Answer 2");
    expect(prompt).toContain("- Question for you · 14:03: Answer 3");
    expect(prompt).toContain(
      "- Commitment · 14:09: Omar sends the export next week. x",
    );
    expect(estimateTokens(prompt)).toBeLessThan(400);
  });

  test("without nudges the ask goes through untouched", () => {
    expect(withNudgeNotes([], "What did you mean by that?")).toBe(
      "What did you mean by that?",
    );
  });
});

describe("nudgeLabel", () => {
  test("leads with the most pressing kind", () => {
    expect(
      nudgeLabel([
        { kind: HitKind.Number, lineIndex: 1, text: "" },
        { kind: HitKind.Question, lineIndex: 2, text: "" },
      ]),
    ).toBe("Question for you");
    expect(
      nudgeLabel([
        { kind: HitKind.Number, lineIndex: 1, text: "" },
        { kind: HitKind.Commitment, lineIndex: 1, text: "" },
      ]),
    ).toBe("Commitment");
  });
});

describe("objection and monologue nudges", () => {
  const PUSHBACK = "Honestly, $48,000 a year is too expensive for us.";

  test("an objection is described as pushback and the card is steered to the pushback tag", () => {
    const lines = [line("Marco", PUSHBACK, 600)];
    const message = nudgeMessage({
      context: "Pricing review · with Marco",
      hits: [
        { kind: HitKind.Objection, lineIndex: 0, text: PUSHBACK },
        { kind: HitKind.Number, lineIndex: 0, text: PUSHBACK },
      ],
      why: "price pushback",
      lines,
    });
    expect(message).toContain(
      `Flagged moment:\n- pushback (price, timing, a competitor, a decision maker or doubt), a number, date or price: "${PUSHBACK}"\nFlagged because: price pushback\nSuggested tag: pushback\n`,
    );
  });

  test("presenting and listening do not steer an extended turn toward a talk-time correction", () => {
    const lines = [
      line(
        "You",
        "And then the reporting layer ties it all together.",
        600,
        700,
      ),
    ];
    const message = nudgeMessage({
      context: "Discovery call · with Omar",
      hits: [
        {
          kind: HitKind.Monologue,
          lineIndex: 0,
          text: "And then the reporting layer ties it all together.",
        },
      ],
      why: "You have talked for 01:40 without handing over",
      lines,
    });
    expect(message).toContain("Suggested tag: talk_time");
    for (const intent of [
      MeetingIntent.Presenting,
      MeetingIntent.Listening,
    ] as const) {
      const prompt = nudgeMessage({
        context: "Team update",
        intent,
        hits: [{ kind: HitKind.Monologue, lineIndex: 0, text: lines[0]!.text }],
        why: "extended turn",
        lines,
      });
      expect(prompt).toContain(lines[0]!.text);
      expect(prompt).not.toContain("Suggested tag: talk_time");
    }
    const asked = nudgeMessage({
      context: "x",
      hits: [hit(0)],
      why: "y",
      lines: [line("Omar", QUESTION, 1)],
    });
    expect(asked).toContain("Flagged because: y\n");
    expect(asked).not.toContain("Suggested tag");
  });

  test("labels lead with the monologue, then pushback, over a question on the same line", () => {
    expect(
      nudgeLabel([
        { kind: HitKind.Question, lineIndex: 1, text: "" },
        { kind: HitKind.Objection, lineIndex: 1, text: "" },
      ]),
    ).toBe("Pushback");
    expect(
      nudgeLabel([{ kind: HitKind.Monologue, lineIndex: 1, text: "" }]),
    ).toBe("Long monologue");
  });
});

test("feedback keeps preferred moments inside the capped model prompt without losing default recency", () => {
  const hits: Hit[] = [
    { kind: HitKind.Objection, lineIndex: 0, text: "The price is too high." },
    { kind: HitKind.Number, lineIndex: 0, text: "The price is too high." },
    hit(1, "First question?"),
    hit(2, "Second question?"),
    hit(3, "Third question?"),
    hit(4, "Latest question?"),
  ];
  const flagged = (store: ReturnType<typeof emptyStore>) =>
    nudgeMessage({
      context: "Meeting",
      hits: prioritizeHitsByFeedback(store, hits),
      why: "unresolved cues",
      lines: [],
    })
      .split("Flagged moment:\n")[1]
      ?.split("\nFlagged because:")[0];
  expect(flagged(emptyStore())).toBe(
    [
      '- a question aimed at the user: "Second question?"',
      '- a question aimed at the user: "Third question?"',
      '- a question aimed at the user: "Latest question?"',
    ].join("\n"),
  );
  expect(
    flagged(
      recordFeedback(emptyStore(), {
        category: MoveTag.Pushback,
        useful: true,
      }),
    ),
  ).toBe(
    [
      '- a question aimed at the user: "Third question?"',
      '- a question aimed at the user: "Latest question?"',
      '- pushback (price, timing, a competitor, a decision maker or doubt), a number, date or price: "The price is too high."',
    ].join("\n"),
  );
});
