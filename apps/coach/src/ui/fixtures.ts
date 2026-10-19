import { SIGN_IN_STEPS } from "../errors";
import type { CoachEvent, StatusEvent } from "../protocol";
import { type CoachState, initialState, reduce } from "./state";

export const status = (overrides: Partial<StatusEvent> = {}): StatusEvent => ({
  type: "status",
  project: {
    path: "/Users/falta/work/northwind",
    source: "series",
    series: "Wafeq weekly sync",
    defaultProject: "/Users/falta/work/northwind",
  },
  model: "sonnet",
  busy: false,
  appConnected: true,
  meeting: true,
  proactive: { state: "on", nudgesUsd: 0.0123, capUsd: 0.5, meetingUsd: 0.0441, meetingTokens: 182_400, cachedTokens: 160_000 },
  ...overrides,
});

const liveTranscript: CoachEvent = {
  type: "transcript",
  strip: { state: "live", title: "Wafeq weekly sync", startedAt: Date.now() - 724_000 },
  lines: [
    { speaker: "Sara", you: false, text: "Thanks for joining. Quick one before we start." },
    { speaker: "You", you: true, text: "Sure, go ahead." },
    { speaker: "Sara", you: false, text: "Can your email channel send a blind copy of every reply to our CRM inbox?" },
    { speaker: "Omar", you: false, text: "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟" },
  ],
  pending: "Our sales team needs every reply logged",
};

const waiting = (lastTitle: string | null): CoachEvent => ({
  type: "transcript",
  strip: { state: "waiting", lastTitle, endedAt: lastTitle ? Date.now() - 240_000 : null },
  lines: [],
  pending: "",
});

const answer = `**Yes, Bcc is live.** Email replies can copy a fixed address on every outbound message.

- Set it under **Settings → Channels → Email → Bcc address**
- It shipped as OPEN-1861 in \`backend/src/email/outbound.ts\`
- Sara can point it at their CRM's dropbox address

العميل يقدر يفعّلها بنفسه من الإعدادات.`;

const steps: CoachEvent[] = [
  {
    type: "tool",
    id: "t1",
    name: "mcp__meeting__live_transcript",
    label: "Read the transcript",
    activeLabel: "Reading the transcript",
    detail: "since ms: 0",
  },
  { type: "tool_result", id: "t1", ok: true, output: "[00:12] Sara: Can your email channel send a blind copy…", durationMs: 420 },
  {
    type: "tool",
    id: "t2",
    name: "Grep",
    label: "Searched for “bcc”",
    activeLabel: "Searching for “bcc”",
    detail: "bcc in backend/src/email",
  },
  { type: "tool_result", id: "t2", ok: true, output: "backend/src/email/outbound.ts:88:  bcc: settings.bcc_address", durationMs: 1_350 },
  {
    type: "tool",
    id: "t3",
    name: "mcp__clients__brief",
    label: "clients · brief",
    activeLabel: "clients · brief",
    detail: "client: wafeq",
  },
  { type: "tool_result", id: "t3", ok: false, output: "The clients server didn't answer in 10s.", durationMs: 10_020 },
];

const usage: CoachEvent = {
  type: "usage",
  usage: {
    model: "claude-sonnet",
    inputTokens: 3_100,
    cachedInputTokens: 38_000,
    cacheCreationTokens: 900,
    outputTokens: 240,
    costUsd: 0.021,
    contextTokens: 42_000,
    contextWindow: 200_000,
  },
};

const conversation: CoachEvent[] = [
  { type: "user", kind: "ask", text: "Can we Bcc every reply to their CRM?" },
  ...steps,
  { type: "text", delta: answer },
  usage,
  { type: "done", seconds: 6.4, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "nudge", text: "Question for you · 14:32" },
  {
    type: "block",
    id: "nudge-1",
    block: {
      kind: "move",
      tag: "open_question",
      headline: "Answer Omar, then give a date",
      verb: "Say",
      line: "لسه بنراجعها، وهبعتلك التحديث يوم الخميس.",
      moment: { speaker: "Omar", quote: "هل تم حل مشكلة الجلسات المفتوحة على واتساب؟", at: "11:52" },
    },
  },
  { type: "done", seconds: 4.1, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "Add an action item to send Sara the Bcc steps" },
  {
    type: "tool",
    id: "e1",
    name: "mcp__meeting__add_action_item",
    label: "Added an action item",
    activeLabel: "Adding an action item",
    detail: "text: Send Sara the Bcc setup steps",
  },
  { type: "edit", edit: { id: "edit-1", session_id: "m1", kind: "add_action_item", summary: "Send Sara the Bcc setup steps", task_id: "task-1" } },
  { type: "tool_result", id: "e1", ok: true, output: "Added.", durationMs: 210 },
  { type: "text", delta: "Want me to draft the steps for Sara too?" },
  { type: "done", seconds: 3.2, ok: true, silent: false, interrupted: false },
];

const readyWrapUp: CoachEvent = {
  type: "wrapup",
  wrapUp: {
    state: "ready",
    title: "Wafeq weekly sync",
    wrapUp: {
      commitments: [
        { who: "You", what: "send Sara the Bcc setup steps", when: "today" },
        { who: "Omar", what: "share two session IDs that stayed open", when: "by Thursday" },
      ],
      open_questions: ["Should the Bcc copy include internal notes?", "هل نحتاج نسخة لكل فريق المبيعات؟"],
      follow_up_draft:
        "Thanks for the time today, Sara and Omar.\n\nNext steps:\n- I'll send the Bcc setup steps today.\n- Omar will share two session IDs that stayed open by Thursday.\n\nOpen: should the Bcc copy include internal notes?",
      coaching: {
        went_well: ["[04:12] You asked Omar which sessions stayed open before proposing a fix."],
        next_time: [
          {
            moment: { speaker: "Sara", at: "18:30", quote: "Would internal notes go to the CRM too?" },
            headline: "Answer it or give a date before moving on",
            verb: "Ask",
            line: "Should internal notes go to the CRM too? I can confirm by Thursday.",
          },
          {
            moment: { speaker: "You", at: "26:05", quote: "Great, talk soon then." },
            headline: "End with the next meeting booked",
            verb: "Say",
            line: "Can we book 20 minutes next Tuesday to check the Bcc setup?",
          },
        ],
      },
    },
    commitments: ["You: send Sara the Bcc setup steps (today)", "Omar: share two session IDs that stayed open (by Thursday)"],
    actions: {
      addActionItems: { enabled: true, hint: null },
      logToClients: { enabled: false, hint: "Turn on Allow changes for “clients” in Settings → Claude → Tools to log promises" },
    },
    added: false,
    logged: false,
    talk: {
      spanMs: 1_620_000,
      totalMs: 1_500_000,
      speakers: [
        { speaker: "You", ms: 870_000 },
        { speaker: "Sara", ms: 420_000 },
        { speaker: "Omar", ms: 210_000 },
      ],
      youLongestMs: 194_000,
      youQuestions: 6,
    },
  },
};

const PRICE_PUSHBACK = "Honestly, that's more than we budgeted for this quarter. Can you do better?";

const coaching: CoachEvent[] = [
  { type: "user", kind: "nudge", text: "Question for you · 14:21" },
  {
    type: "block",
    id: "co-1",
    block: {
      kind: "move",
      tag: "pushback",
      headline: "Ask what's behind the price concern",
      verb: "Ask",
      line: "Is it the total, or how it lands in this quarter's budget?",
      watch_out: "Don't offer a discount yet",
      moment: { speaker: "Sara", quote: PRICE_PUSHBACK, at: "09:41" },
    },
  },
  { type: "done", seconds: 3.2, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "nudge", text: "Question for you · 14:26" },
  {
    type: "block",
    id: "co-2",
    block: {
      kind: "move",
      tag: "talk_time",
      headline: "Answer in one line, then hand it back",
      verb: "Ask",
      line: "Yes, it copies every reply. Which team needs it first?",
      moment: { speaker: "Omar", quote: "So does it copy every reply or not?", at: "13:58" },
    },
  },
  {
    type: "talk",
    talk: {
      spanMs: 600_000,
      totalMs: 580_000,
      speakers: [
        { speaker: "You", ms: 412_000 },
        { speaker: "Sara", ms: 110_000 },
        { speaker: "Omar", ms: 58_000 },
      ],
      youLongestMs: 185_000,
      youQuestions: 1,
    },
  },
  { type: "done", seconds: 2.9, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "catchup", text: "Catch me up · 14:33" },
  { type: "tool", id: "co-t", name: "mcp__meeting__live_transcript", label: "Read the transcript", activeLabel: "Reading the transcript", detail: "since ms: 270000" },
  { type: "tool_result", id: "co-t", ok: true, output: "…", durationMs: 360 },
  {
    type: "text",
    delta:
      "- **Now:** Sara is checking whether Bcc covers replies from their CRM integration.\n- **Open for you:** Omar's question about the WhatsApp sessions.\n- **Promised:** you send the Bcc steps today; Omar shares two session IDs, no date yet.",
  },
  {
    type: "block",
    id: "co-3",
    block: {
      kind: "move",
      tag: "vague_promise",
      headline: "Pin Omar's date",
      verb: "Ask",
      line: "Omar, can you send the two session IDs by Thursday?",
      moment: { speaker: "Omar", quote: "I'll dig those out for you.", at: "12:10" },
    },
  },
  {
    type: "talk",
    talk: {
      spanMs: 600_000,
      totalMs: 590_000,
      speakers: [
        { speaker: "You", ms: 236_000 },
        { speaker: "Sara", ms: 230_000 },
        { speaker: "Omar", ms: 124_000 },
      ],
      youLongestMs: 74_000,
      youQuestions: 4,
    },
  },
  { type: "done", seconds: 6.1, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "What's our price for 40 seats, and how do I say it?" },
  { type: "text", delta: "**€38,400 a year**: 40 seats at €80 a month (`pricing/2026.md`)." },
  {
    type: "block",
    id: "co-4",
    block: {
      kind: "move",
      tag: "buying_signal",
      headline: "Give the number, then the next step",
      verb: "Say",
      line: "It's €38,400 a year for 40 seats. Who else needs to see it before you decide?",
    },
  },
  { type: "done", seconds: 5.4, ok: true, silent: false, interrupted: false },
];

export function screenshotThumb(width: number, height: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#f4f4f5"/><rect width="100%" height="${Math.max(1, Math.round(height * 0.14))}" fill="#27272a"/><rect x="8%" y="26%" width="52%" height="10%" rx="2" fill="#d4d4d8"/><rect x="8%" y="44%" width="84%" height="34%" rx="3" fill="#ffffff" stroke="#e4e4e7"/><text x="50%" y="66%" font-family="Inter, sans-serif" font-size="${Math.max(6, Math.round(Math.min(width, height) / 9))}" text-anchor="middle" fill="#dc2626">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const chartAnswer = `The **Sessions by channel** chart is empty because the date filter is set to *Next 7 days*. Switch it to *Last 7 days* and the bars come back.`;

const rich: CoachEvent[] = [
  {
    type: "user",
    kind: "ask",
    text: "Why is this chart empty?",
    images: [
      { thumb: screenshotThumb(192, 120, "No data"), width: 192, height: 120 },
      { thumb: screenshotThumb(120, 192, "Filters"), width: 120, height: 192 },
    ],
  },
  { type: "text", delta: chartAnswer },
  { type: "done", seconds: 5.2, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "Show me where Bcc sits in the email flow" },
  {
    type: "text",
    delta:
      "Bcc is added right before the message leaves the inbox:\n\n![Outbound email flow](docs/email-flow.png)\n\nSara's CRM vendor shows the same step on their site:\n\n![Northwind CRM dropbox setup](https://cdn.northwind.example.com/help/dropbox-setup.png)",
  },
  { type: "done", seconds: 3.8, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "What did we promise so far?" },
  { type: "tool", id: "r1", name: "mcp__meeting__live_transcript", label: "Read the transcript", activeLabel: "Reading the transcript", detail: null },
  { type: "tool_result", id: "r1", ok: true, output: "…", durationMs: 410 },
  { type: "text", delta: "Three promises so far, two of them yours." },
  { type: "tool", id: "r2", name: "mcp__meeting__show", label: "Showed a list", activeLabel: "Preparing a list", detail: null },
  {
    type: "block",
    id: "blk-1",
    block: {
      kind: "actions",
      items: [
        { text: "send Sara the Bcc setup steps", owner: "You", due: "today" },
        { text: "share the two session IDs that stayed open", owner: "Omar", due: "Thursday" },
        { text: "check whether internal notes are copied", owner: "You" },
      ],
    },
  },
  { type: "tool_result", id: "r2", ok: true, output: "Shown.", durationMs: 12 },
  { type: "block_check", id: "blk-1", index: 2, checked: true },
  {
    type: "edit",
    edit: { id: "edit-r1", session_id: "m1", kind: "add_action_item", summary: "send Sara the Bcc setup steps (today)", task_id: "task-r1" },
    block: { id: "blk-1", index: 0 },
  },
  { type: "done", seconds: 4.4, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "Did Sara email us about the CRM address?" },
  { type: "tool", id: "r3", name: "mcp__claude_ai_Gmail__search_threads", label: "claude ai Gmail · search threads", activeLabel: "claude ai Gmail · search threads", detail: "query: from:sara crm" },
  { type: "tool_result", id: "r3", ok: true, output: "2 threads", durationMs: 1_100 },
  { type: "tool", id: "r4", name: "WebFetch", label: "Read help.example.com", activeLabel: "Reading help.example.com", detail: "url: https://help.example.com/email/outbound-bcc" },
  { type: "tool_result", id: "r4", ok: true, output: "…", durationMs: 900 },
  { type: "text", delta: "Yes: she sent it on Tuesday, **crm-drop@wafeq.example.com**. Their help page confirms Bcc copies every reply." },
  {
    type: "sources",
    sources: [
      { kind: "email", url: "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0", label: "Re: CRM dropbox address", title: "Re: CRM dropbox address\nSara Haddad" },
      { kind: "web", url: "https://help.example.com/email/outbound-bcc", label: "help.example.com", title: "Outbound Bcc addresses\nhttps://help.example.com/email/outbound-bcc" },
    ],
  },
  { type: "block", id: "blk-2", block: { kind: "replies", options: ["Draft the reply", "Summarise for Slack", "Add it to the notes"] } },
  { type: "done", seconds: 7.9, ok: true, silent: false, interrupted: false },
];

const scenarios = {
  idle: [status({ meeting: false, project: { ...status().project, source: "default", series: null } }), waiting(null)],
  live: [status(), liveTranscript],
  thinking: [
    status({ busy: true }),
    liveTranscript,
    { type: "user", kind: "ask", text: "What did Sara just ask?" },
    ...steps.slice(0, 1),
  ],
  streaming: [
    status({ busy: true }),
    liveTranscript,
    { type: "user", kind: "ask", text: "Can we Bcc every reply to their CRM?" },
    ...steps.slice(0, 4),
    { type: "text", delta: answer.slice(0, 120) },
  ],
  conversation: [status(), liveTranscript, ...conversation],
  rich: [status(), liveTranscript, ...rich],
  coaching: [status(), liveTranscript, ...coaching],
  question: [
    status({ busy: true }),
    liveTranscript,
    { type: "user", kind: "ask", text: "Draft a reply to Sara" },
    { type: "tool", id: "q1", name: "AskUserQuestion", label: "Asked you a question", activeLabel: "Waiting for your answer", detail: null },
    {
      type: "question",
      id: "q1",
      questions: [
        {
          question: "How formal should the reply be?",
          header: "Tone",
          multiSelect: false,
          options: [
            { label: "Short and friendly (Recommended)", description: "Two lines, first names" },
            { label: "Formal", description: "Full sentences, sign-off with your title" },
            { label: "In Arabic", description: "Semi-formal, same content" },
          ],
        },
      ],
    },
  ],
  error: [
    status(),
    liveTranscript,
    { type: "user", kind: "ask", text: "What did Sara just ask?" },
    {
      type: "error",
      error: {
        kind: "auth",
        title: "Sign-in expired",
        message: "Your session timed out.",
        detail: `${SIGN_IN_STEPS}\n\nFailed to authenticate. API Error: 401 OAuth token has expired\n\nClaude Code: Error: Invalid API key`,
      },
    },
    { type: "done", seconds: 1.2, ok: false, silent: false, interrupted: false },
  ],
  ended: [status(), waiting("Wafeq weekly sync"), readyWrapUp],
  wrapping: [status(), waiting("Wafeq weekly sync"), { type: "wrapup", wrapUp: { state: "running", title: "Wafeq weekly sync" } }],
  resumed: [
    status(),
    liveTranscript,
    ...conversation.slice(0, 11),
    { type: "divider", text: "Picked up where you left off" },
    { type: "notice", text: "That edit can no longer be undone here." },
  ],
} satisfies Record<string, CoachEvent[]>;

export type Scenario = keyof typeof scenarios;
export function isScenario(name: string): name is Scenario {
  return name in scenarios;
}
export const SCENARIOS: Scenario[] = Object.keys(scenarios).filter(isScenario);

const LONG_ANSWER_SECTION = `## Where Bcc is set

The inbox settings keep a list of **outbound Bcc addresses**. Every reply sent from that inbox copies each address, so a CRM dropbox sees the whole thread.

- Admins edit the list under the inbox settings.
- Up to ten addresses per inbox.
- Replies sent through a ticketing integration are not copied.

\`\`\`ts
const recipients = resolveOutboundBcc(inbox);
await send({ to, cc, bcc: recipients, subject, html });
\`\`\`

العميل يقدر يفعّلها بنفسه من الإعدادات، ومش محتاج يكلم الدعم.

`;

export function longAnswerDeltas(tokens: number): string[] {
  const pieces = LONG_ANSWER_SECTION.match(/\S+\s*|\s+/g) ?? [];
  return Array.from({ length: tokens }, (_, index) => pieces[index % pieces.length] ?? " ");
}

export function fixtureState(name: Scenario, connection: CoachState["connection"] = "open"): CoachState {
  const events: CoachEvent[] = scenarios[name];
  return events.reduce(
    (state, event) => reduce(state, { type: "event", event }),
    reduce(initialState, { type: "connection", connection }),
  );
}
