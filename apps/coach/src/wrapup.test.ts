import { describe, expect, test } from "bun:test";

import { commitmentText, logToClientsPrompt, parseWrapUp, wrapUpPrompt } from "./wrapup";

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
    const next = (n: number) => ({ moment: `[0${n}:00] moment ${n}`, instead: `Say: "line ${n}"` });
    const wrapUp = parseWrapUp({
      commitments: [],
      open_questions: [],
      follow_up_draft: "",
      coaching: { went_well: ["a", "b", "c"], next_time: [next(1), next(2), next(3), next(4)] },
    });
    expect(wrapUp.coaching).toEqual({ went_well: ["a", "b"], next_time: [next(1), next(2), next(3)] });
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
