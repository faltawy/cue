import { type TranscriptLine } from "./transcript";

export enum HitKind {
  Question = "question",
  Name = "name",
  Objection = "objection",
  Commitment = "commitment",
  Number = "number",
  Monologue = "monologue",
}
export type Hit = { kind: HitKind; lineIndex: number; text: string };

const YOU = "You";

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const NOT_LETTER_BEFORE = "(?<![\\p{L}\\p{N}_])";
const NOT_LETTER_AFTER = "(?![\\p{L}\\p{N}_])";
const words = (list: readonly string[]) => list.join("|");

const FILLERS = [
  "so",
  "and",
  "but",
  "okay",
  "ok",
  "well",
  "um",
  "uh",
  "also",
  "then",
  "hey",
  "alright",
  "yeah",
  "طيب",
  "يعني",
  "بس",
  "اه",
  "و",
];
const LEADING_FILLER = new RegExp(
  `^(?:${words(FILLERS)})${NOT_LETTER_AFTER}[,،]?\\s*`,
  "u",
);
const VOCATIVE = /^(?:يا\s+\p{L}+|\p{L}+(?:\s\p{L}+)?)\s*[,،]\s*/u;

const DIRECT_ASKS = [
  "can you",
  "could you",
  "would you",
  "will you",
  "do you",
  "did you",
  "are you",
  "have you",
  "what do you think",
  "what's your take",
  "any thoughts",
  "هل",
  "ممكن",
  "تقدر",
  "تقدري",
  "تقدروا",
  "عندك",
  "عندكم",
  "ليه",
  "ازاي",
  "امتي",
  "فين",
  "مين",
  "لماذا",
  "كيف",
  "متي",
  "اين",
  "ماذا",
];
const WH_QUESTIONS = [
  "what (?:is|are|do|does|did|was|were|would|should|can|could|about|if|time|happens)",
  "how (?:do|does|did|is|are|can|could|would|should|much|many|long|about|often)",
  "when (?:do|does|did|is|are|can|could|will|would|should)",
  "where (?:do|does|did|is|are|can|will)",
  "why (?:do|does|did|is|are|would|should|not|don't|didn't)",
  "who (?:is|are|was|will|would|can|should|owns)",
  "which (?:one|is|are|do|does)",
  "(?:does|is|are|was|were|can|could|should|shall|would|will) (?:it|this|that|there|we|they|he|she)",
];
const OPENER = new RegExp(
  `^(?:${words(DIRECT_ASKS)}|${words(WH_QUESTIONS)})${NOT_LETTER_AFTER}`,
  "u",
);
const ASK_ANYWHERE = new RegExp(
  `${NOT_LETTER_BEFORE}(?:what do you think|what's your take|any thoughts|ايه رايك|رايك ايه|ما رايك|شو رايك|ايش رايك)${NOT_LETTER_AFTER}`,
  "u",
);
const RHETORICAL_TAG =
  /[,،]?\s*(?:you know|right|ok|okay|yeah|no|isn't it|you see|مش كده|مش كدا|صح|ماشي|طيب|يعني)\s*[?؟]$/u;
const MIN_QUESTION_WORDS = 3;
const SMALL_TALK = new RegExp(
  `${NOT_LETTER_BEFORE}(?:how's it going|how are you|how are you doing|how's everyone|can you (?:all |guys )?(?:hear|see) (?:me|us)|can everyone (?:hear|see)|is (?:it|my screen) visible|are you there|عامل ايه|عاملين ايه|ازيك|ازيكم|كيف حالك|كيفك|سامعني|سامعيني|سامعينني)${NOT_LETTER_AFTER}`,
  "u",
);

function stripLead(sentence: string): string {
  let rest = sentence;
  for (;;) {
    const next = rest.replace(LEADING_FILLER, "").replace(VOCATIVE, "");
    if (next === rest) return rest;
    rest = next;
  }
}

function isQuestion(sentence: string): boolean {
  const tagged = RHETORICAL_TAG.test(sentence);
  const body = tagged ? sentence.replace(RHETORICAL_TAG, "").trim() : sentence;
  if (!body || SMALL_TALK.test(body)) return false;
  if (ASK_ANYWHERE.test(body) || OPENER.test(stripLead(body))) return true;
  return (
    !tagged &&
    /[?؟]$/.test(body) &&
    body.split(" ").length >= MIN_QUESTION_WORDS
  );
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function asksQuestion(text: string): boolean {
  return sentences(normalize(text)).some(isQuestion);
}

const bounded = (alternatives: readonly string[]) =>
  new RegExp(
    `${NOT_LETTER_BEFORE}(?:${words(alternatives)})${NOT_LETTER_AFTER}`,
    "u",
  );

const DECIDERS =
  "boss|manager|team|ceo|cfo|cto|coo|director|vp|head of \\p{L}+|legal|procurement|finance|board|partners?|leadership|management|founders?";
const AR_NOT = "مش|مو|مب|ما|مهو|مهوش|ماني|مانيش|مانيب|ما ني|مني";
const AR_DECIDERS =
  "(?:لل|ل|ال)?(?:مدير\\p{L}*|مدراء|اداره|مجلس|ريس|رئيس|مسؤول\\p{L}*|شركاء|شريك\\p{L}*|مالك)";
const AR_ASK_UP =
  "ارجع|نرجع|هرجع|هنرجع|حرجع|اشاور|نشاور|هشاور|استشير|نستشير|اسال|نسال|هسال|اكلم|نكلم|هكلم|هنكلم|اتكلم مع|نتكلم مع|هتكلم مع";
const OBJECTION = bounded([
  "over (?:our |the |my )?budget",
  "(?:out of|above|beyond) (?:our |the |my )?budget",
  "(?:more|higher) than (?:we|i) (?:budgeted|planned|expected)",
  "(?:can't|cannot|can not|couldn't) afford",
  "(?:don't|do not|doesn't|didn't) have (?:the |a |any )?budget",
  "no budget",
  "budget is (?:tight|limited|frozen|gone)",
  "costs? too much",
  "too much (?:money|for us)",
  "(?:the )?price is (?:too |a bit |pretty |really )?(?:high|steep)",
  "(?:something|anything|a) cheaper",
  "not (?:the )?(?:right|best|a good) time",
  "bad tim(?:e|ing)",
  "not now",
  "not (?:a )?priority",
  "(?:on|put (?:it|this) on) hold",
  "(?:maybe|probably|wait (?:until|till)|until|till) (?:the )?next (?:quarter|year)",
  "maybe later",
  "we (?:already|currently) (?:use|work with|pay for|have (?:a |an )?(?:tool|system|solution|vendor|provider|platform|contract))",
  "we're (?:already |currently )?using",
  "(?:happy|fine|ok|okay) with (?:our|what we have|the current)",
  "(?:our|the) current (?:vendor|provider|tool|solution|system|platform|setup)",
  "another (?:vendor|provider|tool|solution|platform)",
  "competitors?",
  "(?:built|build) (?:it|this|our own) in[- ]house",
  `(?:check|talk|speak|confirm|discuss(?: it| this| that)?)(?: in)? with (?:my|our|the) (?:${DECIDERS})`,
  `run (?:it|this|that) (?:by|past) (?:my|our|the) (?:${DECIDERS})`,
  "not (?:my|our) (?:decision|call)",
  "(?:i|we) (?:can't|cannot|don't) (?:decide|make (?:that|this|the) (?:decision|call))",
  "need (?:an |the )?(?:approval|sign-off|signoff|sign off)",
  `(?:has|have|needs?) to (?:be approved|go through) (?:by )?(?:${DECIDERS})`,
  "not (?:sure|convinced|certain) (?:it|this|that|if|whether|about|it'll|this'll|that's|it's|we|they)",
  "not convinced",
  "concerned (?:about|that|with)",
  "(?:my|our|the) (?:main |big |biggest |only |real )?(?:concerns?|worry|worries|hesitations?)",
  "worried (?:about|that)",
  "s[kc]eptical",
  "(?:too|sounds|seems|a bit|pretty|very) risky",
  "i doubt",
  "hesitant",
  "(?:doesn't|does not|won't|will not) (?:work|fit) for us",
  "السعر (?:عالي|كتير|كثير|مرتفع)",
  "الاسعار (?:عاليه|كتير|كثير|مرتفعه)",
  "(?:فوق|اكتر من|اكثر من|اعلي من|خارج) (?:ال)?ميزانيه",
  "(?:ما عندنا|ماعندنا|معندناش|مفيش|مافي|ما في|ما فيه|ما عندي|معنديش) ميزانيه",
  "الميزانيه (?:ما|مش|مو) (?:تسمح|بتسمح|تكفي|هتكفي|كفايه)",
  "الميزانيه محدوده",
  "(?:ما نقدر|مش هنقدر|مش قادرين) ندفع",
  "ارخص",
  `(?:${AR_NOT}) (?:وقته|وقتها|الوقت المناسب|وقت مناسب|دلوقتي|الحين|هلق|هلا)`,
  "(?:ناجل|نؤجل|هناجل|خلينا ناجل)\\p{L}*",
  "تاجيل",
  "عندنا (?:نظام|حل|سيستم|برنامج|مزود)",
  "(?:احنا|حنا|نحن|نحنا) (?:اصلا |حاليا )?(?:بنستخدم|نستخدم|مستخدمين|مشتركين)",
  "(?:شركه|مزود) (?:تانيه|ثانيه|تاني|ثاني|اخري|اخر)",
  "منافس\\p{L}*",
  `(?:${AR_ASK_UP}) ${AR_DECIDERS}`,
  "(?:مش|مو|مب) قراري",
  "القرار (?:مش|مو|مب) (?:بايدي|بيدي|عندي)",
  "(?:محتاج|محتاجين|نحتاج|يحتاج|لازم) موافقه",
  `(?:${AR_NOT}) (?:متاكد|متاكدين|متاكده|مقتنع|مقتنعين|مقتنعه|مطمن|مطمنين|واثق|واثقين)`,
  "قلقان\\p{L}*",
  "(?:عندي|عندنا) (?:قلق|تخوف)",
  "خايف(?:ين)? (?:من|ان|انه|انها)",
  "متخوف\\p{L}*",
  "مخاطره",
]);
const PRICEY = new RegExp(
  `${NOT_LETTER_BEFORE}(?:(?:too|so|very|really|quite|pretty|a bit|kind of|kinda|way too) )?(?:expensive|pricey|costly|overpriced|غالي|غاليه|مكلف|مكلفه)${NOT_LETTER_AFTER}`,
  "gu",
);
const NEGATION = new Set([
  "not",
  "isn't",
  "wasn't",
  "aren't",
  "never",
  "no",
  "hardly",
  "مش",
  "مو",
  "مب",
  "ما",
  "مهو",
  "مهوش",
  "مهوا",
]);
const NEGATION_REACH = 2;

function negated(text: string, at: number): boolean {
  return text
    .slice(0, at)
    .split(/[\s,،]+/u)
    .filter(Boolean)
    .slice(-NEGATION_REACH)
    .some((word) => NEGATION.has(word));
}

function isObjection(text: string): boolean {
  if (OBJECTION.test(text)) return true;
  return [...text.matchAll(PRICEY)].some(
    (match) => !negated(text, match.index),
  );
}

const PROMISE_VERBS = [
  "send",
  "share",
  "get",
  "follow",
  "check",
  "look",
  "email",
  "schedule",
  "set",
  "prepare",
  "update",
  "write",
  "call",
  "ping",
  "review",
  "fix",
  "deliver",
  "draft",
  "book",
  "confirm",
  "circle",
  "loop",
  "put",
  "have",
  "make",
  "find",
  "reach",
  "forward",
  "add",
  "create",
];
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const ARABIC_PROMISES = [
  "سارسل",
  "سنرسل",
  "سوف",
  "ساقوم",
  "سنقوم",
  "ساتابع",
  "ساتواصل",
  "سابعت",
  "هبعت",
  "هنبعت",
  "حبعت",
  "هشوف",
  "هنشوف",
  "هكلم",
  "هرد",
  "هجهز",
  "هنجهز",
  "هعمل",
  "هنعمل",
  "هراجع",
  "هتابع",
  "هتواصل",
];
const COMMITMENT = [
  new RegExp(
    `\\b(?:i|we)(?:'ll| will| shall|'m going to| am going to|'re going to| are going to)\\s+(?:\\w+\\s+)?(?:${words(PROMISE_VERBS)})\\b`,
  ),
  /\blet me (?:send|share|check|follow up|get back|look into|find out|loop|draft)\b/,
  new RegExp(
    `\\bby (?:${WEEKDAYS}|tomorrow|tonight|eod|eow|the end of|end of)\\b`,
  ),
  new RegExp(`\\bnext (?:week|month|quarter|${WEEKDAYS})\\b`),
  /\bend of (?:the )?(?:day|week|month|quarter)\b/,
  new RegExp(`${NOT_LETTER_BEFORE}(?:${words(ARABIC_PROMISES)})`, "u"),
  new RegExp(
    `${NOT_LETTER_BEFORE}(?:بكره|الاسبوع الجاي|الاسبوع القادم|الاسبوع اللي جاي|اخر الاسبوع|نهايه الاسبوع|الشهر الجاي)${NOT_LETTER_AFTER}`,
    "u",
  ),
];

const MONTHS =
  "jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december";
const UNITS = [
  "%",
  "percent",
  "k",
  "m",
  "bn",
  "million",
  "billion",
  "thousand",
  "dollars?",
  "usd",
  "eur",
  "euros?",
  "gbp",
  "sar",
  "riyals?",
  "aed",
  "dirhams?",
  "egp",
  "pounds?",
  "seats?",
  "users?",
  "licen[cs]es?",
  "agents?",
  "days?",
  "weeks?",
  "months?",
  "years?",
  "hours?",
  "minutes?",
  "ريال",
  "دولار",
  "جنيه",
  "درهم",
  "الف",
  "مليون",
  "في الميه",
  "بالميه",
  "يوم",
  "ايام",
  "اسبوع",
  "شهر",
  "سنه",
  "ساعه",
  "مستخدم",
];
const NUMBER = [
  /[$€£¥]\s?\d/,
  new RegExp(
    `\\d(?:[\\d,.]*\\d)?\\s?(?:${words(UNITS)})${NOT_LETTER_AFTER}`,
    "u",
  ),
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`),
  /\bq[1-4]\b/,
  /\b\d{1,3}(?:,\d{3})+\b|\b\d{3,}\b/,
];

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const MIN_NAME_PART = 3;

function namePattern(selfName: string | null): RegExp | null {
  const parts = normalize(selfName ?? "")
    .split(" ")
    .filter((part) => part.length >= MIN_NAME_PART);
  if (parts.length === 0) return null;
  return new RegExp(
    `${NOT_LETTER_BEFORE}(?:${parts.map(escape).join("|")})${NOT_LETTER_AFTER}`,
    "u",
  );
}

export function detectHits(
  line: TranscriptLine,
  lineIndex: number,
  selfName: string | null,
): Hit[] {
  const text = line.text.trim();
  const plain = normalize(text);
  if (!plain) return [];
  const fromOthers = line.speaker !== YOU;
  const found: HitKind[] = [];
  if (fromOthers && sentences(plain).some(isQuestion))
    found.push(HitKind.Question);
  if (fromOthers && namePattern(selfName)?.test(plain))
    found.push(HitKind.Name);
  if (fromOthers && isObjection(plain)) found.push(HitKind.Objection);
  if (COMMITMENT.some((pattern) => pattern.test(plain)))
    found.push(HitKind.Commitment);
  if (NUMBER.some((pattern) => pattern.test(plain))) found.push(HitKind.Number);
  return found.map((kind) => ({ kind, lineIndex, text }));
}
