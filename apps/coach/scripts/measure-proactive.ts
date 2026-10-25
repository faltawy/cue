import { parseArgs } from "node:util";

import { NOTHING } from "../src/checkin";
import { type Hit } from "../src/detect";
import { NUDGE_MODEL, nudgeMessage, nudgeSystem } from "../src/nudge";
import {
  costUsd,
  ONE_SHOT_OVERHEAD_TOKENS,
  estimateTokens as tokens,
  type TokenUsage,
} from "../src/pricing";
import {
  NudgeDispatch,
  Proactive,
  PROACTIVE_DEFAULTS,
  type ProactiveConfig,
  SpendSource,
} from "../src/proactive";
import {
  openAppDb,
  readLiveTranscript,
  renderLines,
  type TranscriptLine,
} from "../src/transcript";
import { TRIAGE_MODEL, TRIAGE_SYSTEM, triagePrompt } from "../src/triage";

export enum MeasurementPath {
  Current = "current",
  Light = "light",
}

// Replays a 45-minute meeting through three ways of speaking up, without calling a model, and prices
// each request with src/pricing.ts:
// - timer: the old check-in every N minutes, two requests in the main coach chat each time
// - current: detectors → Haiku triage → a nudge turn in the main chat (7e3cd24d)
// - light: detectors → Haiku triage → a one-shot Sonnet nudge outside the chat, with the 4-per-10-minutes
//   limit and the $0.50 cap
// --yes sets the share of triage calls that answer yes (default: 0.25, 0.5 and 1).
// Usage: bun scripts/measure-proactive.ts [--every 5] [--yes 0.5] [--db app.db --session <id>]

const { values } = parseArgs({
  options: {
    every: { type: "string", default: "5" },
    db: { type: "string" },
    session: { type: "string" },
    yes: { type: "string" },
  },
});

// Measured from a real coach chat: a fresh chat writes ~25.5k tokens of system prompt, tools and
// project context to the cache on its first request.
const COACH_BASE_CONTEXT = 25_500;
const MAIN_MODEL = "sonnet";
const TRIAGE_OUTPUT = 30;
const TOOL_CALL_OUTPUT = 40;
const ANSWER_OUTPUT = 250;
const NOTHING_OUTPUT = 5;
const LIGHT_ANSWER_OUTPUT = 130;
const FIVE_MINUTES = 5 * 60_000;
// A typical Coach instructions setting: a few sentences.
const INSTRUCTIONS =
  "I'm the account manager for this customer. Keep answers short and never promise dates or discounts.";

const OLD_CHECKIN_PROMPT = `Check-in (automatic, the user did not type this). Call mcp__meeting__live_transcript with since_ms=000000 and read what was said since the last check-in.
Surface at most 3 one-line bullets, only for:
- a question aimed at the user that is still unanswered
- a claim about the project that the code or docs contradict (cite the file)
- a commitment the user made (who, what, when)
- context from the project the user will likely need for the current topic
If nothing clears that bar, reply with exactly ${NOTHING} and nothing else.`;

// The in-chat nudge prompt from 7e3cd24d, kept here only to price the "current" path.
function currentNudgePrompt(
  hits: readonly Hit[],
  why: string,
  lines: readonly TranscriptLine[],
): string {
  const kept: TranscriptLine[] = [];
  let chars = 0;
  for (const line of [...lines].reverse()) {
    chars += line.text.length + line.speaker.length + 10;
    if (chars > 4_000 && kept.length > 0) break;
    kept.unshift(line);
  }
  const moments = hits
    .map((hit) => `- ${hit.kind}: "${hit.text.slice(0, 300)}"`)
    .join("\n");
  return `Nudge (automatic, the user did not type this). A moment in the meeting may need you:
${moments}
Flagged because: ${why}
New lines since you last looked (earlier ones left out; call mcp__meeting__live_transcript with since_ms=000000 if you need them):
${renderLines(kept) || "(none)"}
Help with that moment in at most 3 short lines: the answer or fact the user needs (look it up in the project and cite the file when it helps), or the commitment to remember (who, what, when). If you have nothing the user doesn't already know, reply with exactly ${NOTHING} and nothing else.`;
}

type Scripted = TranscriptLine & { worth: boolean };

const FILLER: Array<[string, string]> = [
  [
    "Omar",
    "So on our side the main thing this quarter is getting the support team onto one inbox.",
  ],
  [
    "Sara",
    "Yeah, and the agents keep switching between three tools, which slows everyone down.",
  ],
  [
    "You",
    "That matches what we saw in the pilot, the switching was the biggest complaint.",
  ],
  [
    "Omar",
    "Right, and the managers want one view of everything that is waiting.",
  ],
  [
    "Sara",
    "We also had some issues with the old macros, people did not trust them.",
  ],
  [
    "You",
    "We rebuilt that part, the replies now pull from the help center articles.",
  ],
  ["Omar", "Okay, that is good to hear, the articles are mostly up to date."],
  ["Sara", "يعني الفريق كله متعود على الطريقة القديمة، محتاجين وقت شوية."],
  [
    "You",
    "Totally, we usually roll it out team by team so nobody is surprised.",
  ],
  [
    "Omar",
    "And the reporting, the weekly report is what my boss actually reads.",
  ],
  ["Sara", "The tags were a mess last year, we cleaned most of them up."],
  ["You", "Good, clean tags make the weekly report much more useful."],
  [
    "Omar",
    "I think the bigger question is how the handoff to a human feels for the customer.",
  ],
  ["Sara", "Customers hate repeating themselves, that is the main thing."],
  [
    "You",
    "The agent sees the whole conversation, so nobody has to repeat anything.",
  ],
  [
    "Omar",
    "That was the problem with the last vendor, it all got lost in the transfer.",
  ],
  ["Sara", "احنا جربنا حاجة شبه كده قبل كده ومكانتش ماشية كويس."],
  [
    "You",
    "Fair, the difference here is that the context stays on the session.",
  ],
  ["Omar", "Makes sense, I like that it is one place."],
  ["Sara", "Okay, I am writing this down for the team."],
];

const MOMENTS: Array<{
  minute: number;
  speaker: string;
  text: string;
  worth: boolean;
}> = [
  {
    minute: 3,
    speaker: "Omar",
    text: "Ahmad, can you Bcc every reply to our CRM, or only new sessions?",
    worth: true,
  },
  {
    minute: 6,
    speaker: "Sara",
    text: "We have around 40 agents and maybe 12 team leads.",
    worth: true,
  },
  {
    minute: 8,
    speaker: "Omar",
    text: "It is a lot of change for them, you know?",
    worth: false,
  },
  {
    minute: 10,
    speaker: "You",
    text: "I'll send you the rollout plan by Friday.",
    worth: true,
  },
  {
    minute: 13,
    speaker: "Sara",
    text: "Do you support single sign on with Okta?",
    worth: true,
  },
  {
    minute: 15,
    speaker: "Omar",
    text: "We had 200 people at the offsite, it was a lot of fun.",
    worth: false,
  },
  {
    minute: 18,
    speaker: "Omar",
    text: "What would the price be for 40 seats, roughly?",
    worth: true,
  },
  {
    minute: 21,
    speaker: "Sara",
    text: "هل ممكن نربط الواتساب بنفس الرقم اللي عندنا؟",
    worth: true,
  },
  {
    minute: 24,
    speaker: "You",
    text: "What do you think about starting with the billing team?",
    worth: false,
  },
  {
    minute: 26,
    speaker: "Omar",
    text: "We will share the old macros export next week.",
    worth: true,
  },
  {
    minute: 29,
    speaker: "Sara",
    text: "Is that really how it works, right?",
    worth: false,
  },
  {
    minute: 31,
    speaker: "Omar",
    text: "Could you walk us through what happens when the AI is not sure?",
    worth: true,
  },
  {
    minute: 34,
    speaker: "Sara",
    text: "Our renewal with the current vendor is on March 3rd.",
    worth: true,
  },
  {
    minute: 37,
    speaker: "Omar",
    text: "Falta mentioned a sandbox last time, is that still possible?",
    worth: true,
  },
  {
    minute: 40,
    speaker: "Sara",
    text: "هبعتلكم قائمة الأسئلة اللي عند الفريق بكره.",
    worth: true,
  },
  {
    minute: 43,
    speaker: "Omar",
    text: "Can you send a short summary after this call?",
    worth: true,
  },
];

const MEETING_MINUTES = 45;
const MS_PER_WORD = 380;

function scriptedMeeting(): Scripted[] {
  const lines: Scripted[] = [];
  let at = 0;
  let filler = 0;
  let moment = 0;
  let previous = "";
  const push = (speaker: string, text: string, worth: boolean) => {
    const gap =
      speaker === previous ? 2_400 : 700 + ((lines.length * 397) % 900);
    const start = at + gap;
    const end = start + text.split(" ").length * MS_PER_WORD;
    lines.push({
      speaker,
      channel: speaker === "You" ? 0 : 1,
      start_ms: start,
      end_ms: end,
      text,
      worth,
    });
    at = end;
    previous = speaker;
  };
  while (at < MEETING_MINUTES * 60_000) {
    const next = MOMENTS[moment];
    if (next && at >= next.minute * 60_000) {
      push(next.speaker, next.text, next.worth);
      moment += 1;
      continue;
    }
    const [speaker, text] = FILLER[filler % FILLER.length] ?? ["Omar", "Okay."];
    push(speaker, text, false);
    filler += 1;
  }
  return lines;
}

function recordedMeeting(db: string, session: string): Scripted[] {
  const transcript = readLiveTranscript(openAppDb(db), { sessionId: session });
  if (!transcript) throw new Error(`no transcript for session ${session}`);
  return transcript.lines.map((line) => ({ ...line, worth: false }));
}

class Bill {
  requests = 0;
  fresh = 0;
  cached = 0;
  usd = 0;

  add(model: string, usage: TokenUsage): number {
    const usd = costUsd(model, usage);
    if (usd === null)
      throw new Error(
        `Cannot measure spend: pricing is unavailable for ${model}.`,
      );
    this.requests += 1;
    this.fresh +=
      usage.inputTokens + usage.cacheCreationTokens + usage.outputTokens;
    this.cached += usage.cachedInputTokens;
    this.usd += usd;
    return usd;
  }
}

// The main coach chat: Claude Code caches the whole conversation with the 1-hour TTL for Claude sign-ins, so
// each request re-reads everything so far and writes what is new. The first request writes the base context.
class MainChat {
  private context = 0;
  private unwritten = COACH_BASE_CONTEXT;

  constructor(private readonly bill: Bill) {}

  request(newInput: number, output: number): number {
    const write = this.unwritten + newInput;
    const usd = this.bill.add(MAIN_MODEL, {
      inputTokens: 0,
      cachedInputTokens: this.context,
      cacheCreationTokens: write,
      outputTokens: output,
    });
    this.context += write;
    this.unwritten = output;
    return usd;
  }
}

// A one-shot call: the fixed prefix (Claude Code's wrapper and our system prompt) is read from cache while
// still warm; the rest is written at the call's TTL.
class OneShot {
  private lastAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly bill: Bill,
    private readonly model: string,
    private readonly ttl: "5m" | "1h",
  ) {}

  call(now: number, prefix: number, unique: number, output: number) {
    const warm =
      now - this.lastAt <
      (this.ttl === "5m" ? FIVE_MINUTES : 12 * FIVE_MINUTES);
    this.lastAt = now;
    const write = warm ? unique : prefix + unique;
    const usage = {
      inputTokens: 0,
      cachedInputTokens: warm ? prefix : 0,
      cacheCreationTokens: write,
      cacheWrite5mTokens: this.ttl === "5m" ? write : 0,
      outputTokens: output,
    };
    const usd = this.bill.add(this.model, usage);
    return {
      usd,
      tokens: usage.cachedInputTokens + write + output,
      cachedTokens: usage.cachedInputTokens,
    };
  }
}

function timer(lines: Scripted[], everyMinutes: number) {
  const bill = new Bill();
  const chat = new MainChat(bill);
  let checkedThrough = 0;
  const end = lines.at(-1)?.end_ms ?? 0;
  for (
    let at = everyMinutes * 60_000;
    at <= end + everyMinutes * 60_000;
    at += everyMinutes * 60_000
  ) {
    const heard = lines.filter(
      (line) => line.end_ms <= at && line.end_ms > checkedThrough,
    );
    if (heard.length === 0) continue;
    checkedThrough = heard.at(-1)?.end_ms ?? checkedThrough;
    chat.request(tokens(OLD_CHECKIN_PROMPT), TOOL_CALL_OUTPUT);
    chat.request(
      tokens(renderLines(heard)) + 20,
      heard.some((line) => line.worth) ? ANSWER_OUTPUT : NOTHING_OUTPUT,
    );
  }
  return { triaged: 0, nudges: 0, bill };
}

async function replay(lines: Scripted[], yes: number, path: MeasurementPath) {
  const bill = new Bill();
  const chat = new MainChat(bill);
  const triageCalls = new OneShot(
    bill,
    TRIAGE_MODEL,
    path === MeasurementPath.Light ? "5m" : "1h",
  );
  const nudgeCalls = new OneShot(bill, NUDGE_MODEL, "5m");
  const config: ProactiveConfig =
    path === MeasurementPath.Light
      ? { ...PROACTIVE_DEFAULTS, enabled: true }
      : {
          ...PROACTIVE_DEFAULTS,
          enabled: true,
          rateMax: Number.POSITIVE_INFINITY,
          capUsd: Number.POSITIVE_INFINITY,
        };
  const triagePrefix = ONE_SHOT_OVERHEAD_TOKENS + tokens(TRIAGE_SYSTEM);
  const nudgePrefix =
    ONE_SHOT_OVERHEAD_TOKENS + tokens(nudgeSystem(INSTRUCTIONS));
  let now = 0;
  let triaged = 0;
  let nudges = 0;
  const proactive: Proactive = new Proactive(config, {
    now: () => now,
    busy: () => false,
    context: () => "Rollout sync · with Omar, Sara",
    changed: () => {},
    metric: () => {},
    triage: async (request) => {
      triaged += 1;
      const spend = triageCalls.call(
        now,
        triagePrefix,
        tokens(triagePrompt(request)),
        TRIAGE_OUTPUT,
      );
      const nudge = Math.floor(triaged * yes) > Math.floor((triaged - 1) * yes);
      return { verdict: { nudge, why: "open question for the user" }, spend };
    },
    nudge: (request) => {
      nudges += 1;
      if (path === MeasurementPath.Light) {
        proactive.spend(
          SpendSource.Nudges,
          nudgeCalls.call(
            now,
            nudgePrefix,
            tokens(nudgeMessage(request)),
            LIGHT_ANSWER_OUTPUT,
          ),
        );
      } else {
        const usd = chat.request(
          tokens(currentNudgePrompt(request.hits, request.why, request.lines)),
          ANSWER_OUTPUT,
        );
        proactive.spend(SpendSource.Nudges, {
          usd,
          tokens: 0,
          cachedTokens: 0,
        });
      }
      return NudgeDispatch.Started;
    },
  });
  const end = (lines.at(-1)?.end_ms ?? 0) + 120_000;
  for (now = 0; now <= end; now += 1_000) {
    const visible = lines.filter((line) => line.end_ms <= now);
    const speaking = lines.find(
      (line) => line.start_ms <= now && line.end_ms > now,
    );
    const pending = speaking
      ? speaking.text.slice(
          0,
          Math.floor(
            ((now - speaking.start_ms) /
              (speaking.end_ms - speaking.start_ms)) *
              speaking.text.length,
          ),
        )
      : "";
    proactive.observe({
      lines: visible,
      pending,
      live: true,
      selfName: "Ahmad Falta",
    });
    for (let step = 0; step < 5; step += 1) await Promise.resolve();
  }
  return { triaged, nudges, bill };
}

const lines =
  values.db && values.session
    ? recordedMeeting(values.db, values.session)
    : scriptedMeeting();
const minutes = Math.round((lines.at(-1)?.end_ms ?? 0) / 60_000);
const every = Number(values.every);
const rates = values.yes ? [Number(values.yes)] : [0.25, 0.5, 1];

const k = (value: number) => `${(value / 1_000).toFixed(1)}k`;
const row = (cells: Array<string | number>) =>
  console.log(
    cells
      .map((cell, index) => String(cell).padEnd(index === 1 ? 22 : 10))
      .join(""),
  );

console.log(
  `${values.db ? "Recorded" : "Scripted"} meeting: ${minutes} min, ${lines.length} lines, ${k(tokens(renderLines(lines)))} transcript tokens. Prices from src/pricing.ts; no model calls.\n`,
);
row([
  "yes",
  "path",
  "triage",
  "nudges",
  "requests",
  "tokens",
  "cached",
  "≈ USD",
]);
const old = timer(lines, every);
for (const yes of rates) {
  const results: Array<[string, Awaited<ReturnType<typeof replay>>]> = [
    [`timer (${every} min)`, old],
    ["current (in chat)", await replay(lines, yes, MeasurementPath.Current)],
    ["light (one-shot)", await replay(lines, yes, MeasurementPath.Light)],
  ];
  for (const [name, result] of results) {
    const { bill } = result;
    row([
      `${yes * 100}%`,
      name,
      result.triaged,
      result.nudges,
      bill.requests,
      k(bill.fresh + bill.cached),
      k(bill.cached),
      `$${bill.usd.toFixed(3)}`,
    ]);
  }
}
