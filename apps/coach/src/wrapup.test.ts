import { describe, expect, test } from "bun:test";

import { commitmentText, logToClientsPrompt, parseWrapUp } from "./wrapup";

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
    });
    expect(wrapUp.commitments).toEqual([
      { who: "You", what: "send the Bcc steps", when: "today" },
      { who: "Sara", what: "confirm the CRM address", when: null },
    ]);
    expect(wrapUp.open_questions).toEqual(["Should the copy include internal notes?", "Who owns SSO?"]);
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
    });
    expect(prompt).toContain('"Acme weekly"');
    expect(prompt).toContain("- share the deck (today)\n- Sara: confirm seats");
    expect(prompt).toContain("ask me instead of guessing");
  });
});
