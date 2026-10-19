import { describe, expect, test } from "bun:test";

import { detectHits, type HitKind } from "./detect";

const line = (speaker: string, text: string) => ({ speaker, channel: speaker === "You" ? 0 : 1, start_ms: 0, end_ms: 1, text });

const kinds = (speaker: string, text: string, selfName: string | null = "Ahmad Falta"): HitKind[] =>
  detectHits(line(speaker, text), 7, selfName)
    .map((hit) => hit.kind)
    .sort();

describe("detectHits: questions", () => {
  test.each([
    ["Can you send me the pricing sheet after this?", ["question"]],
    ["So could you walk us through the Bcc setup", ["question"]],
    ["What do you think about moving the launch", ["question"]],
    ["Do you support SSO with Okta?", ["question"]],
    ["How does the handoff work when the agent is offline?", ["question"]],
    ["We tried it last month. Does it also work on WhatsApp?", ["question"]],
    ["Omar, can you share the doc", ["question"]],
    ["هل في طريقة نربط الإيميل بالـ CRM؟", ["question"]],
    ["ممكن تبعتلي الملف", ["question"]],
    ["طيب إيه رأيك في الفكرة دي", ["question"]],
    ["الـ Bcc بيشتغل على كل الـ replies ولا لأ؟", ["question"]],
  ])("another speaker asking fires: %s", (text, expected) => {
    expect(kinds("Omar", text)).toEqual(expected as HitKind[]);
  });

  test.each([
    "Can you send me the pricing sheet after this?",
    "What do you think about moving the launch",
    "هل في طريقة نربط الإيميل بالـ CRM؟",
  ])("the user asking the same thing does not: %s", (text) => {
    expect(kinds("Omar", text)).toEqual(["question"]);
    expect(kinds("You", text)).toEqual([]);
  });

  test.each([
    ["We shipped it last week, you know?", []],
    ["It is a lot of work, right?", []],
    ["You know?", []],
    ["Really?", []],
    ["الموضوع ده مهم جدا، مش كده؟", []],
    ["What we did was turn it off for a while.", []],
    ["I told them how it works yesterday.", []],
    ["Hey everyone, how's it going?", []],
    ["Test, test. Can you hear me, guys?", []],
    ["Is my screen visible on your end?", []],
    ["إزيكم، عاملين إيه؟", []],
  ])("rhetorical tags and statements stay quiet: %s", (text, expected) => {
    expect(kinds("Omar", text)).toEqual(expected as HitKind[]);
  });

  test("a rhetorical tag does not hide a real ask before it", () => {
    expect(kinds("Omar", "Can you send it today, right?")).toEqual(["question"]);
    expect(kinds("Omar", "It is a lot of work, right?")).toEqual([]);
  });
});

describe("detectHits: the user's name", () => {
  test("fires when someone else says any part of the user's name, case-insensitively", () => {
    expect(kinds("Omar", "I think falta had the numbers on this.")).toEqual(["name"]);
    expect(kinds("Omar", "Ahmad mentioned that last time.")).toEqual(["name"]);
  });

  test("does not fire inside another word, from the user, or with no name set", () => {
    expect(kinds("Omar", "Ahmad mentioned that last time.")).toEqual(["name"]);
    expect(kinds("Omar", "Ahmadi mentioned that last time.")).toEqual([]);
    expect(kinds("You", "Ahmad mentioned that last time.")).toEqual([]);
    expect(kinds("Omar", "Ahmad mentioned that last time.", null)).toEqual([]);
  });

  test("an Arabic name matches in Arabic speech", () => {
    expect(kinds("Omar", "يا أحمد شفت الرسالة", "أحمد فلته")).toEqual(["name"]);
    expect(kinds("Omar", "يا محمد شفت الرسالة", "أحمد فلته")).toEqual([]);
  });
});

describe("detectHits: commitments", () => {
  test.each([
    ["You", "I'll send the contract over tonight."],
    ["Omar", "We will share the migration plan"],
    ["Omar", "Let me follow up with legal on that"],
    ["You", "We can have it done by Friday"],
    ["Omar", "Let's pick this up next week"],
    ["Omar", "سأرسل لك العرض"],
    ["You", "هبعتلك الملف النهارده"],
    ["Omar", "نخلص الموضوع ده الأسبوع الجاي"],
  ])("fires for %s: %s", (speaker, text) => {
    expect(kinds(speaker, text)).toEqual(["commitment"]);
  });

  test.each([
    ["Omar", "I'll be honest with you, it was rough."],
    ["Omar", "We will see how it goes."],
    ["Omar", "هو قال كده امبارح"],
  ])("small talk with the same words stays quiet for %s: %s", (speaker, text) => {
    expect(kinds(speaker, text)).toEqual([]);
  });
});

describe("detectHits: numbers, dates and prices", () => {
  test.each([
    "The plan is $1,200 a month",
    "We need about 40 seats",
    "Churn went down 12% last quarter",
    "The contract renews on March 3rd",
    "Can we go live on 15/11",
    "It costs 500 ريال",
    "عندنا ٣٠ يوم تجربة",
  ])("fires: %s", (text) => {
    expect(kinds("Omar", text)).toContain("number");
  });

  test.each(["I have two kids and a cat", "Give me a sec", "We may try it in May"])("stays quiet: %s", (text) => {
    expect(kinds("Omar", text)).toEqual([]);
  });
});

describe("detectHits: hit shape", () => {
  test("reports one hit per kind with the line index and the line's text", () => {
    const hits = detectHits(line("Omar", "Ahmad, can you send the $1,200 quote by Friday?"), 12, "Ahmad Falta");
    expect(hits.map((hit) => hit.kind).sort()).toEqual(["commitment", "name", "number", "question"]);
    for (const hit of hits) {
      expect(hit.lineIndex).toBe(12);
      expect(hit.text).toBe("Ahmad, can you send the $1,200 quote by Friday?");
    }
  });
});
