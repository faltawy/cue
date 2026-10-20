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

describe("detectHits: objections and pushback from the other side", () => {
  test.each([
    ["price", "Honestly, this is too expensive for a team our size."],
    ["price", "That's way over our budget for this year."],
    ["price", "We just can't afford that right now."],
    ["timing", "It's not the right time for us."],
    ["timing", "Not now, let's revisit it in the new year."],
    ["competitor", "We already use Zendesk for all of this."],
    ["competitor", "We're pretty happy with our current vendor."],
    ["authority", "I need to check with my boss before we commit."],
    ["authority", "That's not my decision to make."],
    ["doubt", "I'm not sure it works at our volume."],
    ["doubt", "I'm a bit concerned about the migration."],
    ["price, Gulf", "والله السعر غالي علينا شوي"],
    ["price, Egyptian", "بصراحة ده غالي جدا علينا"],
    ["price, Gulf", "ما عندنا ميزانية لهذا الشي"],
    ["price, Levantine", "كتير غالي هيدا"],
    ["timing, Egyptian", "مش وقته دلوقتي خالص"],
    ["timing, Gulf", "مو وقته الحين"],
    ["timing, Levantine", "هلق مش وقتها"],
    ["competitor", "احنا عندنا نظام شغال من سنتين"],
    ["authority", "لازم أرجع للمدير قبل ما نقرر"],
    ["authority, Levantine", "بدي إرجع للمدير بالأول"],
    ["doubt, Egyptian", "مش متأكد إن ده هيمشي معانا"],
    ["doubt, Gulf", "مو متأكد إنه يناسبنا"],
  ])("fires on %s: %s", (_, text) => {
    expect(kinds("Omar", text)).toContain("objection");
  });

  test.each(["Other tools are too expensive, ours isn't.", "لازم أرجع للمدير قبل ما نقرر", "مش متأكد إن ده هيمشي معانا"])(
    "the user saying it is not pushback: %s",
    (text) => {
      expect(kinds("Omar", text)).toContain("objection");
      expect(kinds("You", text)).not.toContain("objection");
    },
  );

  test.each([
    ["negated price", "Honestly it's not too expensive for what it does."],
    ["negated price", "It isn't expensive at all."],
    ["negated price, Egyptian", "السعر مش غالي أبدا"],
    ["negated price, Gulf", "السعر مو غالي"],
    ["sure, not unsure", "I'm sure it works for our volume."],
    ["sure, not unsure, Arabic", "أنا متأكد إن ده هيمشي معانا"],
    ["already, not a competitor", "We already shipped the new inbox."],
    ["عندنا without a system", "عندنا اجتماع مع الفريق"],
    ["small talk", "The weather has been lovely this week."],
  ])("near-miss stays quiet (%s): %s", (_, text) => {
    expect(kinds("Omar", text)).not.toContain("objection");
  });
});
