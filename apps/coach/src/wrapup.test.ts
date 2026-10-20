import { describe, expect, test } from "bun:test";

import { showTool } from "./meeting-server";
import { NUDGE_SYSTEM } from "./nudge";
import { coachPrompt } from "./session";
import { commitmentText, logToClientsPrompt, parseWrapUp, WRAP_UP_SYSTEM, wrapUpPrompt } from "./wrapup";

const NO_COACHING = { went_well: [], next_time: [] };

describe("parseWrapUp", () => {
  test("drops repeated open questions and commitments the model listed twice, keeping the first wording", () => {
    const wrapUp = parseWrapUp({
      commitments: [
        { who: "You", what: "send the Bcc steps", when: "today" },
        { who: "Sara", what: "confirm the CRM address", when: null },
        { who: "you", what: "Send the  Bcc steps", when: "today" },
      ],
      open_questions: ["Should the copy include internal notes?", "Who owns SSO?", "should the copy include internal notes? "],
      follow_up_draft: "Thanks.",
      coaching: NO_COACHING,
    });
    expect(wrapUp.commitments).toEqual([
      { who: "You", what: "send the Bcc steps", when: "today" },
      { who: "Sara", what: "confirm the CRM address", when: null },
    ]);
    expect(wrapUp.open_questions).toEqual(["Should the copy include internal notes?", "Who owns SSO?"]);
  });

  test("keeps coaching short: two things that went well and three for next time, first ones first", () => {
    const next = (n: number) => ({
      moment: { speaker: "Marco", at: `0${n}:00`, quote: `moment ${n}` },
      headline: `change ${n}`,
      verb: "Say" as const,
      line: `line ${n}`,
    });
    const wrapUp = parseWrapUp({
      commitments: [],
      open_questions: [],
      follow_up_draft: "",
      coaching: { went_well: ["a", "b", "c"], next_time: [next(1), next(2), next(3), next(4)] },
    });
    expect(wrapUp.coaching).toEqual({ went_well: ["a", "b"], next_time: [next(1), next(2), next(3)] });
  });

  test.each([
    ["the old free-text shape", { moment: "[12:40] Marco pushed back on price", instead: 'Ask: "What is behind it?"' }],
    ["a verb other than Say or Ask", { moment: { speaker: "Marco", at: null, quote: "too much" }, headline: "Probe", verb: "Tell", line: "x" }],
    ["a moment without a speaker", { moment: { at: "12:40", quote: "too much" }, headline: "Probe", verb: "Ask", line: "x" }],
  ])("refuses a next-time item in %s", (_name, item) => {
    expect(() =>
      parseWrapUp({ commitments: [], open_questions: [], follow_up_draft: "", coaching: { went_well: [], next_time: [item] } }),
    ).toThrow();
    expect(
      parseWrapUp({
        commitments: [],
        open_questions: [],
        follow_up_draft: "",
        coaching: { went_well: [], next_time: [{ moment: { speaker: "Marco", at: null, quote: "too much" }, headline: "Probe", verb: "Ask", line: "x" }] },
      }).coaching.next_time,
    ).toHaveLength(1);
  });
});

describe("wrapUpPrompt", () => {
  const line = (speaker: string, startS: number, endS: number, text: string) => ({
    speaker,
    channel: speaker === "You" ? 0 : 1,
    start_ms: startS * 1_000,
    end_ms: endS * 1_000,
    text,
  });

  test("gives the model the whole meeting's talk balance ahead of the transcript", () => {
    const prompt = wrapUpPrompt(
      {
        sessionId: "s",
        transcriptId: "t",
        title: "Pricing review",
        live: false,
        startedAtMs: 0,
        endedAtMs: 1_500_000,
        lines: [line("You", 0, 900, "Let me walk you through all of it."), line("Marco", 900, 1_200, "Too expensive.")],
        pending: "",
      },
      { sessionId: "s", title: "Pricing review", startedAt: null, endedAt: null, participants: [{ name: "Marco", email: null }] },
    );
    expect(prompt).toBe(
      "Invited: Marco\n\nTalk time, last 20 min: You 75%, Marco 25% · your longest stretch 15:00 · questions you asked: 0\n\nMeeting: Pricing review (ended)\n[00:00] You: Let me walk you through all of it.\n[15:00] Marco: Too expensive.",
    );
  });

  test("an Arabic meeting reaches the model in Arabic and its Arabic wrap-up survives parsing, repeats dropped", () => {
    const prompt = wrapUpPrompt(
      {
        sessionId: "s",
        transcriptId: "t",
        title: "مراجعة الأسعار",
        live: false,
        startedAtMs: 0,
        endedAtMs: 120_000,
        lines: [line("You", 0, 30, "هبعتلك عرض السعر بكرة."), line("عمر", 30, 60, "مين هيوافق على الميزانية؟")],
        pending: "",
      },
      { sessionId: "s", title: "مراجعة الأسعار", startedAt: null, endedAt: null, participants: [{ name: "عمر", email: null }] },
    );
    expect(prompt).toStartWith("Invited: عمر\n\n");
    expect(prompt).toEndWith("Meeting: مراجعة الأسعار (ended)\n[00:00] You: هبعتلك عرض السعر بكرة.\n[00:30] عمر: مين هيوافق على الميزانية؟");

    const draft = "شكراً يا عمر على وقتك. هبعتلك عرض السعر بكرة.";
    const wrapUp = parseWrapUp({
      commitments: [
        { who: "You", what: "إرسال عرض السعر", when: "بكرة" },
        { who: "You", what: "إرسال  عرض السعر ", when: "بكرة" },
      ],
      open_questions: ["مين هيوافق على الميزانية؟", " مين هيوافق على  الميزانية؟"],
      follow_up_draft: draft,
      coaching: {
        went_well: ["حددت موعد إرسال العرض"],
        next_time: [
          { moment: { speaker: "عمر", at: "00:30", quote: "مين هيوافق على الميزانية؟" }, headline: "Pin down the budget owner", verb: "Ask", line: "مين غيرك لازم يوافق؟" },
        ],
      },
    });
    expect(wrapUp.commitments).toEqual([{ who: "You", what: "إرسال عرض السعر", when: "بكرة" }]);
    expect(wrapUp.open_questions).toEqual(["مين هيوافق على الميزانية؟"]);
    expect(wrapUp.follow_up_draft).toBe(draft);
    expect(commitmentText({ who: "عمر", what: "مراجعة الميزانية", when: "الأحد" })).toBe("عمر: مراجعة الميزانية (الأحد)");
  });
});

describe("commitmentText", () => {
  test("names the owner unless it is the user, and keeps the stated deadline", () => {
    expect(commitmentText({ who: "Sara", what: "send the pricing sheet", when: "Friday" })).toBe(
      "Sara: send the pricing sheet (Friday)",
    );
    expect(commitmentText({ who: "You", what: "share the deck", when: null })).toBe("share the deck");
  });
});

describe("logToClientsPrompt", () => {
  test("lists every promise and tells the coach to ask rather than guess the client", () => {
    const prompt = logToClientsPrompt("Acme weekly", {
      commitments: [
        { who: "You", what: "share the deck", when: "today" },
        { who: "Sara", what: "confirm seats", when: null },
      ],
      open_questions: [],
      follow_up_draft: "",
      coaching: NO_COACHING,
    });
    expect(prompt).toContain('"Acme weekly"');
    expect(prompt).toContain("- share the deck (today)\n- Sara: confirm seats");
    expect(prompt).toContain("ask me instead of guessing");
  });
});

describe("meeting language", () => {
  const PROMPTS = {
    "the coach chat": coachPrompt([], true),
    "nudges": NUDGE_SYSTEM,
    "the wrap-up": WRAP_UP_SYSTEM,
    "the move block": showTool(() => {}).description,
  };

  test.each(Object.entries(PROMPTS))("%s pins only the UI headline to English, so a non-English meeting gets its replies, lines and follow-up in its own language", (_, prompt) => {
    const english = prompt.match(/[^.;\n]*\bEnglish\b[^.;\n]*/g) ?? [];
    expect(english.filter((clause) => !clause.includes("headline"))).toEqual([]);
    expect(prompt).toContain("meeting's main language");
  });
});
