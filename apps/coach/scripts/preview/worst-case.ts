import { CoachEditKind, ProjectSource } from "../../src/app-bridge";
import { BlockKind } from "../../src/blocks";
import { CoachErrorKind } from "../../src/errors";
import { StripState } from "../../src/meeting-state";
import { type Move, MoveTag, MoveVerb } from "../../src/move";
import { ProactiveState } from "../../src/proactive";
import {
  type CoachEvent,
  CoachEventType,
  SetupState,
  type StatusEvent,
  TurnKind,
  WrapUpState,
  type WrapUpView,
} from "../../src/protocol";
import { SourceKind } from "../../src/sources";
import { type TalkStats } from "../../src/talk-time";
import { screenshotThumb } from "../../src/ui/fixtures";
import {
  ActionType,
  type CoachState,
  Connection,
  initialState,
  reduce,
} from "../../src/ui/state";

// Dev-only fixtures for the preview's "Demo data / Worst case / Empty / One / Huge" toggle.
// Every value is something a real meeting, model or project can produce; limits are noted where the
// server clips (turn-events.ts DETAIL_MAX 400 / OUTPUT_MAX 4_000, errors.ts DETAIL_MAX 2_000,
// server.ts keeps the last 6 transcript lines). Meeting titles, speaker names, prompts, answers,
// question text and wrap-up fields are unbounded.

export enum DataSet {
  Worst = "worst",
  Empty = "empty",
  One = "one",
  Huge = "huge",
  Rich = "rich",
  Coaching = "coaching",
}
export enum Phase {
  Live = "live",
  Ended = "ended",
}

const LONG_PATH =
  "/Users/aleksandra.wisniewska-kowalczyk/work/clients/northwind-industries-holdings/customer-success-playbooks";

const status = (overrides: Partial<StatusEvent> = {}): StatusEvent => ({
  type: CoachEventType.Status,
  project: {
    path: LONG_PATH,
    source: ProjectSource.Series,
    series:
      "Northwind Industries Holdings × Contoso — Weekly implementation sync (EMEA, rescheduled)",
    defaultProject:
      "/Users/aleksandra.wisniewska-kowalczyk/work/contoso-platform-monorepo-main",
    needsFolder: false,
  },
  model: "sonnet",
  busy: true,
  appConnected: true,
  meeting: true,
  proactive: {
    state: ProactiveState.Capped,
    nudgesUsd: 100.0042,
    capUsd: 100,
    meetingUsd: 1_234.5678,
    meetingTokens: 125_000_000,
    cachedTokens: 120_000_000,
  },
  setup: { state: SetupState.Ready },
  ...overrides,
});

const WORST_TITLE =
  "Northwind Industries Holdings × Contoso — Weekly implementation sync: Email Bcc rollout, WhatsApp open sessions & SSO (rescheduled from Tue)";
const ARABIC_TITLE =
  "اجتماع المتابعة الأسبوعي مع فريق المبيعات والدعم الفني بخصوص تفعيل النسخة المخفية";

const worstTranscript: CoachEvent = {
  type: CoachEventType.Transcript,
  strip: {
    state: StripState.Live,
    title: WORST_TITLE,
    startedAt: Date.now() - 4_512_000,
  },
  lines: [
    {
      speaker: "Aleksandra Wiśniewska-Kowalczyk",
      you: false,
      text: "So the way our sales team works today is that every single reply has to land in the CRM, otherwise the account executive doesn't see it, and last quarter we lost two renewals because nobody saw the customer had already asked for a discount in a thread that never got logged, so for us this is really the blocker before we can roll the email channel out to the other four regions and the partner desk in Kraków.",
    },
    { speaker: "Jo", you: false, text: "Yep." },
    {
      speaker: "Đặng Thị Ngọc Hân",
      you: false,
      text: "Can you send it to bartholomew.fitzgerald@northwind-industries-holdings.example.com instead?",
    },
    {
      speaker: "نور الهدى عبد الرحمن",
      you: false,
      text: "يعني الـ Bcc بيشتغل على كل الـ replies ولا على الـ tickets بس؟",
    },
    {
      speaker: "Speaker 12",
      you: false,
      text: "https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
    },
    { speaker: "You", you: true, text: "Let me check that while we talk." },
  ],
  pending:
    "and the other thing I wanted to raise is the WhatsApp sessions that stayed open since the fourteenth of September because our agents keep",
};

const ANSWER = `## Short answer

**Yes**, with one catch: replies a ticketing integration delivers are *not* copied.

| Setting | Where | Limit | Applies to replies sent from | Notes |
| --- | --- | --- | --- | --- |
| \`outbound_bcc_addresses\` | Inbox settings → Email → Outbound Bcc addresses | 10 | the inbox itself | Silently Bcc'd on every reply |
| \`ticketing.forward_copy\` | Integrations → Zendesk v2 → Advanced | 1 | the ticketing system | Off by default |

Refs: \`backend/src/email-channel/service/resolve-outbound-bcc-recipients-for-ticketing-integrations.ts:128\`, \`backend/src/email-channel/dtos/update-allowed-email.dto.ts:70\`

Docs: https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved

\`\`\`ts
const recipients = resolveOutboundBccRecipientsForTicketingIntegrations({ inbox, organizationId, includeInternalNotes: false, dedupeAgainst: [...to, ...cc] });
\`\`\`

1. Ask Aleksandra Wiśniewska-Kowalczyk for the CRM dropbox address
   - it usually looks like \`first.last+billing-notifications@example.com\`
     - some CRMs reject plus-addressing, so test once first
2. Paste it into the inbox settings

> Omar asked earlier whether internal notes are included. They are not.

Literal text the model echoed: <script>alert(1)</script> &amp; **unclosed bold

العميل يقدر يفعّلها بنفسه من الإعدادات، ومش محتاج يكلم الدعم. الـ Bcc بيتبعت على كل رد من الـ inbox نفسه بس.

👩🏽‍💻 Priya from their IT team owns the SSO part.`;

const worstSteps: CoachEvent[] = [
  {
    type: CoachEventType.Tool,
    id: "w1",
    name: "Read",
    label:
      "Read resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
    activeLabel:
      "Reading resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
    detail:
      "/Users/aleksandra.wisniewska-kowalczyk/work/contoso-platform-monorepo-main/backend/src/email-channel/service/__tests__/resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
  },
  {
    type: CoachEventType.ToolResult,
    id: "w1",
    ok: true,
    output: `${'{"recipients":["bartholomew.fitzgerald@northwind-industries-holdings.example.com","first.last+billing-notifications@example.com"],"inboxId":"9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f","organizationId":"e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f"}'.repeat(18).slice(0, 3_999)}…`,
    durationMs: 120,
  },
  {
    type: CoachEventType.Tool,
    id: "w2",
    name: "Grep",
    label: "Searched for “outbound_bcc_addresses|bcc_recipients|crmDro…”",
    activeLabel:
      "Searching for “outbound_bcc_addresses|bcc_recipients|crmDro…”",
    detail:
      "outbound_bcc_addresses|bcc_recipients|crmDropbox|forward_copy in backend/src",
  },
  {
    type: CoachEventType.ToolResult,
    id: "w2",
    ok: true,
    output: null,
    durationMs: 900,
  },
  {
    type: CoachEventType.Tool,
    id: "w3",
    name: "mcp__contoso__get_session_structured_field_values",
    label: "contoso · get session structured field values",
    activeLabel: "contoso · get session structured field values",
    detail:
      'session id: 9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f\norganization id: e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f\nfields: ["crm_dropbox_address","bcc_enabled","ticketing_integration","region","partner_desk","renewal_risk","account_executive_email"]',
  },
  {
    type: CoachEventType.ToolResult,
    id: "w3",
    ok: false,
    output:
      "MCP error -32603: Request failed with status 504 Gateway Timeout at https://example.com/api/v2/organizations/e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f/sessions/9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f/structured-field-values?include=definitions,variants,groups",
    durationMs: 30_000,
  },
  {
    type: CoachEventType.Tool,
    id: "w4",
    name: "Bash",
    label: "Ran git log --oneline -n 20 -- backend/src/email-channel/se…",
    activeLabel:
      "Running git log --oneline -n 20 -- backend/src/email-channel/se…",
    detail:
      "git log --oneline -n 20 -- backend/src/email-channel/service/resolve-outbound-bcc-recipients-for-ticketing-integrations.ts",
  },
  {
    type: CoachEventType.ToolResult,
    id: "w4",
    ok: true,
    output:
      "4d2f1a9 fix email threading: emit Message-ID and In-Reply-To headers",
    durationMs: 300,
  },
];

const longPrompt = `Can you check whether they can Bcc every reply to their CRM? Context from Aleksandra: "we lost two renewals because nobody saw the thread", the address is bartholomew.fitzgerald@northwind-industries-holdings.example.com
Also look at https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved`;

const usage = (contextTokens: number): CoachEvent => ({
  type: CoachEventType.Usage,
  usage: {
    model: "claude-sonnet",
    inputTokens: 12_840,
    cachedInputTokens: 171_000,
    cacheCreationTokens: 4_100,
    outputTokens: 2_310,
    costUsd: 0.4123,
    contextTokens,
    contextWindow: 200_000,
  },
});

// Coaching moves: headline ≤ 100, line ≤ 400, watch_out ≤ 120, quote ≤ 300, speaker ≤ 80 (src/move.ts).
// Talk time is computed from the transcript, so its speaker count and names are unbounded.
const LONG_SPEAKER =
  "Christopher Alexander Montgomery III (Northwind Industries Holdings, Procurement EMEA)";
const LONG_QUOTE =
  "So just to be really clear about where we are, if the Bcc copy doesn't include the replies that come back through the ticketing integration then honestly we can't roll this out to the partner desk in Kraków at all, and I'd need to take that back to the steering group before the renewal call in two weeks";

const WORST_MOVE: Move = {
  tag: MoveTag.DecisionOwner,
  headline:
    "Name who confirms the integration replies and by when, before the renewal call, so it doesn't drift",
  verb: MoveVerb.Say,
  line: "قبل ما نكمل في الأسعار: أنا هأكدلكم يوم الخميس الساعة ١٢ إذا كانت الردود اللي بتيجي من خلال تكامل التذاكر بتتنسخ في الـ Bcc ولا لأ، وكريستوفر يبعتلنا رقمين الجلسات اللي فضلت مفتوحة من ١٤ سبتمبر عشان نراجعهم مع فريق الدعم قبل مكالمة التجديد مع المشتريات. ينفع كده؟",
  watch_out:
    "Don't promise integration replies are copied; the docs say they aren't today, and procurement will hold you to it",
  moment: {
    speaker: LONG_SPEAKER.slice(0, 80),
    quote: LONG_QUOTE.slice(0, 300),
    at: "125:07",
  },
};

const TWELVE_NAMES = [
  "Aleksandra Wiśniewska-Kowalczyk",
  "نور الهدى عبد الرحمن",
  "Jo",
  "Đặng Thị Ngọc Hân",
  "Speaker 12",
  "Christopher Alexander Montgomery III",
  "Them",
  "Speaker 3",
  "Bartholomew Fitzgerald",
  "Li",
  "Speaker 7",
];

export function talkOf(
  speakers: TalkStats["speakers"],
  spanMs: number,
  youLongestMs: number,
  youQuestions: number,
): TalkStats {
  return {
    spanMs,
    totalMs: speakers.reduce((sum, entry) => sum + entry.ms, 0),
    speakers,
    youLongestMs,
    youQuestions,
  };
}

const TWELVE_SPEAKERS = talkOf(
  [
    { speaker: "You", ms: 2_000 },
    ...TWELVE_NAMES.map((speaker, index) => ({
      speaker,
      ms: [210_000, 150_000, 90_000][index] ?? 15_000,
    })),
  ],
  600_000,
  2_000,
  0,
);

const WHOLE_MEETING_TWELVE = talkOf(
  [
    { speaker: "You", ms: 3_212_000 },
    ...TWELVE_NAMES.map((speaker, index) => ({
      speaker,
      ms: [1_400_000, 900_000, 600_000][index] ?? 41_000,
    })),
  ],
  7_512_000,
  1_507_000,
  47,
);

const worstConversation: CoachEvent[] = [
  {
    type: CoachEventType.Divider,
    text: "Picked up where you left off after the app restarted during Northwind Industries Holdings weekly sync",
  },
  { type: CoachEventType.User, kind: TurnKind.Ask, text: longPrompt },
  ...worstSteps,
  { type: CoachEventType.Text, delta: ANSWER },
  usage(191_000),
  {
    type: CoachEventType.Done,
    seconds: 41.7,
    ok: true,
    silent: false,
    interrupted: false,
  },
  {
    type: CoachEventType.User,
    kind: TurnKind.Nudge,
    text: "Question for you · 14:32",
  },
  {
    type: CoachEventType.Block,
    id: "worst-move",
    block: { kind: BlockKind.Move, ...WORST_MOVE },
  },
  { type: CoachEventType.Talk, talk: TWELVE_SPEAKERS },
  {
    type: CoachEventType.Done,
    seconds: 4.1,
    ok: true,
    silent: false,
    interrupted: false,
  },
  {
    type: CoachEventType.User,
    kind: TurnKind.Ask,
    text: "اكتب ملاحظة إن العميل محتاج الـ Bcc قبل التجديد",
  },
  {
    type: CoachEventType.Tool,
    id: "e1",
    name: "mcp__meeting__update_note",
    label: "Wrote to the notes",
    activeLabel: "Writing to the notes",
    detail: "markdown: - العميل محتاج الـ Bcc قبل التجديد",
  },
  {
    type: CoachEventType.Edit,
    edit: {
      id: "edit-w1",
      session_id: "m1",
      kind: CoachEditKind.Note,
      summary:
        "- العميل محتاج الـ Bcc على كل الردود قبل التجديد في الربع الرابع، وإلا مش هيوسّعوا لباقي المناطق",
      task_id: null,
    },
  },
  {
    type: CoachEventType.ToolResult,
    id: "e1",
    ok: true,
    output: "Added.",
    durationMs: 140,
  },
  {
    type: CoachEventType.Tool,
    id: "e2",
    name: "mcp__meeting__add_action_item",
    label: "Added an action item",
    activeLabel: "Adding an action item",
    detail:
      "text: Send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps and the two session IDs that stayed open on WhatsApp since 14 September",
  },
  {
    type: CoachEventType.Edit,
    edit: {
      id: "edit-w2",
      session_id: "m1",
      kind: CoachEditKind.AddActionItem,
      summary:
        "Send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps and the two session IDs that stayed open on WhatsApp since 14 September",
      task_id: "task-1",
    },
  },
  { type: CoachEventType.Undone, id: "edit-w1", summary: "" },
  {
    type: CoachEventType.ToolResult,
    id: "e2",
    ok: true,
    output: "Added.",
    durationMs: 210,
  },
  { type: CoachEventType.Text, delta: "تمام، ضفت الملاحظة." },
  {
    type: CoachEventType.Done,
    seconds: 3.2,
    ok: true,
    silent: false,
    interrupted: false,
  },
  {
    type: CoachEventType.Edit,
    edit: {
      id: "edit-w3",
      session_id: "m1",
      kind: CoachEditKind.CompleteActionItem,
      summary: "Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf",
      task_id: "task-2",
    },
  },
  {
    type: CoachEventType.User,
    kind: TurnKind.Ask,
    text: "What did Jo just say?",
  },
  {
    type: CoachEventType.Error,
    error: {
      kind: CoachErrorKind.Auth,
      title: "Claude sign-in expired",
      message:
        "Open Terminal, run `claude`, and type `/login`. Then try again.",
      detail: `Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired. Please obtain a new token or refresh your existing token."},"request_id":"req_011CUZ9f8e7d6c5b4a4c3d8e2f1a0b9c8d7e6f"}\n    at /Users/aleksandra.wisniewska-kowalczyk/Library/Caches/com.hyprnote.dev/claude-code/0.3.302/claude:1:28471923`,
    },
  },
  {
    type: CoachEventType.Done,
    seconds: 1.2,
    ok: false,
    silent: false,
    interrupted: false,
  },
  {
    type: CoachEventType.Notice,
    text: "That edit can no longer be undone here because a new meeting started in a different series folder.",
  },
  {
    type: CoachEventType.User,
    kind: TurnKind.Ask,
    text: "Draft a reply to Aleksandra",
  },
  {
    type: CoachEventType.Tool,
    id: "q1",
    name: "AskUserQuestion",
    label: "Asked you a question",
    activeLabel: "Waiting for your answer",
    detail: null,
  },
  {
    type: CoachEventType.Question,
    id: "q1",
    questions: [
      {
        question:
          "How formal should the reply to Aleksandra Wiśniewska-Kowalczyk be, given she escalated the lost renewals to her VP last week?",
        header: "Tone of the reply",
        multiSelect: false,
        options: [
          {
            label: "Neutral professional (Recommended)",
            description:
              "Polite, plain, no filler. Safe default for a customer or partner who escalated.",
          },
          { label: "Warm", description: "" },
          {
            label: "Benachrichtigungseinstellungen-konform und förmlich",
            description:
              "Formal German register, the way their legal team writes",
          },
          { label: "بالعربي", description: "شبه رسمي، نفس المحتوى" },
        ],
      },
      {
        question: "Which points should it cover?",
        header: "Scope",
        multiSelect: true,
        options: [
          {
            label: "Bcc setup",
            description: "Steps for outbound_bcc_addresses",
          },
          {
            label: "WhatsApp sessions",
            description:
              "The two session IDs that stayed open since 14 September",
          },
        ],
      },
    ],
  },
];

const worstWrapUp = (title: string): WrapUpView => ({
  state: WrapUpState.Ready,
  title,
  wrapUp: {
    commitments: [
      {
        who: "You",
        what: "send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps",
        when: "today",
      },
      {
        who: "Christopher Alexander Montgomery III",
        what: "share the two WhatsApp session IDs that stayed open since 14 September, plus screenshots of the agent view showing them as still assigned",
        when: "by end of day Thursday 16 October (Riyadh time), before the renewal call with procurement",
      },
      { who: "Them", what: "confirm the CRM dropbox address", when: null },
      {
        who: "Jo",
        what: "invite bartholomew.fitzgerald@northwind-industries-holdings.example.com",
        when: "Fri",
      },
      {
        who: "نور الهدى عبد الرحمن",
        what: "ترسل قائمة بالفرق اللي محتاجة نسخة",
        when: "الأسبوع الجاي",
      },
    ],
    open_questions: [
      "Should the Bcc copy include internal notes?",
      "Does Bcc apply to replies a ticketing integration delivers? https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
      "هل نحتاج نسخة لكل فريق المبيعات ولا للمدير بس؟",
      "Should the Bcc copy include internal notes?",
    ],
    follow_up_draft: `Hi Aleksandra, Christopher, Jo and نور الهدى,

Thanks for the time today, and sorry again that the renewal threads never reached your CRM.

Next steps:
- I'll send the Bcc setup steps today. You'll add bartholomew.fitzgerald@northwind-industries-holdings.example.com under Inbox settings → Email → Outbound Bcc addresses.
- Christopher will share the two WhatsApp session IDs that stayed open since 14 September by end of day Thursday 16 October (Riyadh time).
- Jo will invite the CRM owner on Friday.

Open questions:
- Should the Bcc copy include internal notes?
- Does Bcc apply to replies a ticketing integration delivers? Details: https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved

شكرًا ليكم، وهبعتلكم التفاصيل النهارده.

Best,
Ahmad`,
    coaching: {
      went_well: [
        "[02:40] You let Aleksandra finish the story about the two lost renewals before saying anything about Bcc, and then asked what the account executives actually need to see in the CRM.",
        "[31:05] لخصت مين هيعمل إيه قبل ما المكالمة تخلص.",
      ],
      next_time: [
        {
          moment: { speaker: LONG_SPEAKER, at: "14:22", quote: LONG_QUOTE },
          headline:
            "Answer the integration question before moving on to pricing, or give a date for the answer",
          verb: MoveVerb.Ask,
          line: "Before we move on, can I come back to you by Thursday on whether integration replies get the Bcc too?",
        },
        {
          moment: {
            speaker: "نور الهدى عبد الرحمن",
            at: null,
            quote: "الأسبوع الجاي",
          },
          headline: "Pin the day",
          verb: MoveVerb.Ask,
          line: "تمام، ينفع نقول يوم الثلاثاء؟ ومين هيبعت القائمة؟",
        },
        {
          moment: {
            speaker: "You",
            at: "27:45",
            quote: "And the other thing about the reporting layer is",
          },
          headline: "Stop and hand the floor back",
          verb: MoveVerb.Ask,
          line: "What do you think?",
        },
      ],
    },
  },
  commitments: [],
  actions: {
    addActionItems: { enabled: true, hint: null },
    logToClients: { enabled: true, hint: null },
  },
  added: false,
  logged: false,
  talk: WHOLE_MEETING_TWELVE,
});

const waiting = (lastTitle: string | null): CoachEvent => ({
  type: CoachEventType.Transcript,
  strip: {
    state: StripState.Waiting,
    lastTitle,
    endedAt: lastTitle ? Date.now() - 90_000 : null,
  },
  lines: [],
  pending: "",
});

function worst(phase: Phase): CoachEvent[] {
  if (phase === Phase.Ended) {
    return [
      status({ busy: false, meeting: false }),
      waiting(ARABIC_TITLE),
      ...worstConversation.slice(0, 26),
      { type: CoachEventType.Wrapup, wrapUp: worstWrapUp(ARABIC_TITLE) },
    ];
  }
  return [status(), worstTranscript, ...worstConversation];
}

function empty(phase: Phase): CoachEvent[] {
  if (phase === Phase.Ended) {
    return [
      status({ busy: false, meeting: false }),
      waiting("Untitled"),
      {
        type: CoachEventType.Wrapup,
        wrapUp: {
          state: WrapUpState.Ready,
          title: null,
          wrapUp: {
            commitments: [],
            open_questions: [],
            follow_up_draft: "",
            coaching: { went_well: [], next_time: [] },
          },
          commitments: [],
          actions: {
            addActionItems: { enabled: false, hint: null },
            logToClients: { enabled: false, hint: null },
          },
          added: false,
          logged: false,
          talk: null,
        },
      },
    ];
  }
  return [
    status({
      busy: false,
      project: {
        path: "/",
        source: ProjectSource.Default,
        series: null,
        defaultProject: "/",
        needsFolder: false,
      },
    }),
    {
      type: CoachEventType.Transcript,
      strip: { state: StripState.Live, title: "Untitled", startedAt: null },
      lines: [],
      pending: "",
    },
  ];
}

function one(phase: Phase): CoachEvent[] {
  const base: CoachEvent[] = [
    status({
      busy: phase === Phase.Live,
      project: {
        path: "/Users/jo/a",
        source: ProjectSource.Default,
        series: "J",
        defaultProject: "/Users/jo/a",
        needsFolder: false,
      },
    }),
    phase === Phase.Live
      ? {
          type: CoachEventType.Transcript,
          strip: {
            state: StripState.Live,
            title: "J",
            startedAt: Date.now() - 5_000,
          },
          lines: [{ speaker: "Jo", you: false, text: "Ok." }],
          pending: "",
        }
      : waiting("J"),
    { type: CoachEventType.User, kind: TurnKind.Ask, text: "?" },
    {
      type: CoachEventType.Tool,
      id: "o1",
      name: "Glob",
      label: "Searched files",
      activeLabel: "Searching files",
      detail: "*",
    },
    {
      type: CoachEventType.ToolResult,
      id: "o1",
      ok: true,
      output: "a",
      durationMs: 1,
    },
    { type: CoachEventType.Text, delta: "1" },
    usage(100_000),
    {
      type: CoachEventType.Done,
      seconds: 1,
      ok: true,
      silent: false,
      interrupted: false,
    },
  ];
  if (phase === Phase.Ended) {
    return [
      ...base,
      {
        type: CoachEventType.Wrapup,
        wrapUp: {
          state: WrapUpState.Ready,
          title: "J",
          wrapUp: {
            commitments: [{ who: "Jo", what: "call", when: null }],
            open_questions: ["Why?"],
            follow_up_draft: "Thanks.",
            coaching: {
              went_well: ["X"],
              next_time: [
                {
                  moment: { speaker: "Jo", at: "00:01", quote: "Ok." },
                  headline: "Ask",
                  verb: MoveVerb.Ask,
                  line: "?",
                },
              ],
            },
          },
          commitments: [],
          actions: {
            addActionItems: { enabled: true, hint: null },
            logToClients: { enabled: false, hint: null },
          },
          added: false,
          logged: false,
          talk: talkOf([{ speaker: "You", ms: 60_000 }], 60_000, 60_000, 1),
        },
      },
    ];
  }
  return [
    ...base,
    { type: CoachEventType.User, kind: TurnKind.Ask, text: "Reply?" },
    {
      type: CoachEventType.Tool,
      id: "oq",
      name: "AskUserQuestion",
      label: "Asked you a question",
      activeLabel: "Waiting for your answer",
      detail: null,
    },
    {
      type: CoachEventType.Question,
      id: "oq",
      questions: [
        {
          question: "Send it?",
          header: "Q",
          multiSelect: false,
          options: [{ label: "Yes", description: "" }],
        },
      ],
    },
  ];
}

const HUGE_SECTION = `### Section

Every reply sent from that inbox copies each address, so a CRM dropbox sees the whole thread. Replies sent through a ticketing integration are not copied, which matters for the partner desk.

- Admins edit the list under the inbox settings.
- Up to ten addresses per inbox.

\`\`\`ts
const recipients = resolveOutboundBcc(inbox);
\`\`\`

`;

function huge(phase: Phase): CoachEvent[] {
  const events: CoachEvent[] = [
    status({ busy: false }),
    phase === Phase.Live ? worstTranscript : waiting(WORST_TITLE),
  ];
  for (let turn = 0; turn < 199; turn += 1) {
    events.push(
      {
        type: CoachEventType.User,
        kind: turn % 10 === 9 ? TurnKind.Nudge : TurnKind.Ask,
        text:
          turn % 10 === 9
            ? `You were mentioned · ${String(9 + Math.floor(turn / 30)).padStart(2, "0")}:${String((turn * 7) % 60).padStart(2, "0")}`
            : `Question ${turn + 1}: what did they just ask about the Bcc rollout?`,
      },
      {
        type: CoachEventType.Tool,
        id: `h${turn}`,
        name: "mcp__meeting__live_transcript",
        label: "Read the transcript",
        activeLabel: "Reading the transcript",
        detail: null,
      },
      {
        type: CoachEventType.ToolResult,
        id: `h${turn}`,
        ok: true,
        output: "…",
        durationMs: 300,
      },
      {
        type: CoachEventType.Text,
        delta: `Answer ${turn + 1}: Aleksandra asked whether every reply is copied to the CRM.`,
      },
      {
        type: CoachEventType.Done,
        seconds: 3,
        ok: true,
        silent: false,
        interrupted: false,
      },
    );
  }
  events.push({
    type: CoachEventType.User,
    kind: TurnKind.Ask,
    text: "Walk me through everything about Bcc, in detail.",
  });
  for (let step = 0; step < 50; step += 1) {
    events.push(
      {
        type: CoachEventType.Tool,
        id: `s${step}`,
        name: step % 2 ? "Grep" : "Read",
        label:
          step % 2 ? `Searched for “bcc_${step}”` : `Read outbound-${step}.ts`,
        activeLabel: "Reading",
        detail: `backend/src/email-channel/service/outbound-${step}.ts`,
      },
      {
        type: CoachEventType.ToolResult,
        id: `s${step}`,
        ok: step % 17 !== 0,
        output: `line ${step}`,
        durationMs: 100,
      },
    );
  }
  let answer = "";
  while (answer.length < 30_000) answer += HUGE_SECTION;
  events.push(
    { type: CoachEventType.Text, delta: answer.slice(0, 30_000) },
    usage(150_000),
    {
      type: CoachEventType.Done,
      seconds: 88,
      ok: true,
      silent: false,
      interrupted: false,
    },
  );
  if (phase === Phase.Ended)
    events.push({
      type: CoachEventType.Wrapup,
      wrapUp: worstWrapUp(WORST_TITLE),
    });
  return events;
}

// Rich blocks: the show tool allows up to 30 action items (text ≤ 300, owner ≤ 80, due ≤ 60) and 2–3
// follow-ups (≤ 60 chars); source chips are capped at 5 with labels clipped to 80; images are capped at 4
// per ask with thumbnails ≤ 192px on the long edge, any aspect.
const LONG_ITEM =
  "share the two WhatsApp session IDs that stayed open since 14 September, plus screenshots of the agent view showing them as still assigned to bartholomew.fitzgerald@northwind-industries-holdings.example.com, and confirm with procurement that the renewal call can move to the week after the Bcc rollout lands";

const RICH_ITEMS = [
  {
    text: LONG_ITEM,
    owner: "Christopher Alexander Montgomery III",
    due: "by end of day Thursday 16 October (Riyadh time)",
  },
  {
    text: "ترسل قائمة بالفرق اللي محتاجة نسخة من كل رد قبل التجديد",
    owner: "نور الهدى عبد الرحمن",
    due: "الأسبوع الجاي",
  },
  {
    text: "invite https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved",
    owner: "Jo",
  },
  { text: "X", owner: "You" },
  ...Array.from({ length: 26 }, (_, index) => ({
    text: `follow up on open question ${index + 5} about the Bcc rollout`,
    ...(index % 3 === 0 ? { owner: "Aleksandra Wiśniewska-Kowalczyk" } : {}),
    ...(index % 4 === 0 ? { due: "Fri" } : {}),
  })),
];

const thumb = (width: number, height: number, label: string) => ({
  thumb: screenshotThumb(width, height, label),
  width,
  height,
});

function rich(phase: Phase): CoachEvent[] {
  const edit = (id: string, index: number, summary: string): CoachEvent => ({
    type: CoachEventType.Edit,
    edit: {
      id,
      session_id: "m1",
      kind: CoachEditKind.AddActionItem,
      summary,
      task_id: id,
    },
    block: { id: "rich-actions", index },
  });
  return [
    status({ busy: false, meeting: phase === Phase.Live }),
    phase === Phase.Live ? worstTranscript : waiting(WORST_TITLE),
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "Here are the screenshots from Aleksandra Wiśniewska-Kowalczyk's team — what's wrong with the agent view? https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments",
      images: [
        thumb(192, 8, "panorama"),
        thumb(8, 192, "tall"),
        thumb(1, 1, ""),
        thumb(192, 144, "Agent view"),
      ],
    },
    {
      type: CoachEventType.Text,
      delta:
        "Both sessions are still assigned to an agent who went offline on 14 September, so they never auto-close.",
    },
    {
      type: CoachEventType.Done,
      seconds: 9.4,
      ok: true,
      silent: false,
      interrupted: false,
    },
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "Show me every diagram we have for the Bcc rollout",
    },
    {
      type: CoachEventType.Text,
      delta: [
        "![Outbound email flow, from the agent's reply through Bcc resolution to the provider, including the ticketing integration branch that skips the copy](docs/email-flow.png)",
        "![](docs/huge-architecture.png)",
        "![tiny](docs/pixel.png)",
        "![Timeline](docs/panorama.png)",
        "![Org chart](docs/tall.png)",
        "![Architecture](docs/arch.svg)",
        "![Old diagram](docs/missing-diagram.png)",
        "![Northwind's CRM dropbox setup guide](https://cdn.northwind-industries-holdings.example.com/help/articles/2026/crm-dropbox-setup-step-3-outbound-bcc.png)",
        "![tracker](http://tracker.example.com/pixel.gif)",
        "![inline](data:image/png;base64,iVBORw0KGgo=)",
      ].join("\n\n"),
    },
    {
      type: CoachEventType.Done,
      seconds: 6.3,
      ok: true,
      silent: false,
      interrupted: false,
    },
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "",
      images: [thumb(144, 192, "Settings")],
    },
    {
      type: CoachEventType.Text,
      delta:
        "That's the inbox settings page; Outbound Bcc addresses is the third field.",
    },
    {
      type: CoachEventType.Done,
      seconds: 3.1,
      ok: true,
      silent: false,
      interrupted: false,
    },
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "List every promise from this call as action items",
    },
    {
      type: CoachEventType.Tool,
      id: "rw1",
      name: "mcp__meeting__live_transcript",
      label: "Read the transcript",
      activeLabel: "Reading the transcript",
      detail: null,
    },
    {
      type: CoachEventType.ToolResult,
      id: "rw1",
      ok: true,
      output: "…",
      durationMs: 380,
    },
    {
      type: CoachEventType.Text,
      delta: "Thirty promises; most are follow-ups on open questions.",
    },
    {
      type: CoachEventType.Block,
      id: "rich-actions",
      block: { kind: BlockKind.Actions, items: RICH_ITEMS },
    },
    {
      type: CoachEventType.BlockCheck,
      id: "rich-actions",
      index: 1,
      checked: true,
    },
    {
      type: CoachEventType.BlockCheck,
      id: "rich-actions",
      index: 3,
      checked: true,
    },
    edit("rich-e1", 0, LONG_ITEM),
    edit("rich-e2", 2, "Jo: invite …"),
    { type: CoachEventType.Undone, id: "rich-e2", summary: "" },
    edit("rich-e3", 1, RICH_ITEMS[1]?.text ?? ""),
    {
      type: CoachEventType.Done,
      seconds: 12.6,
      ok: true,
      silent: false,
      interrupted: false,
    },
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "What does their CTO say publicly about Bcc, and did anyone email us?",
    },
    {
      type: CoachEventType.Tool,
      id: "rw2",
      name: "WebSearch",
      label: "Searched the web for “Northwind Industries Holdings CTO Bcc C…”",
      activeLabel:
        "Searching the web for “Northwind Industries Holdings CTO Bcc C…”",
      detail: "query: Northwind Industries Holdings CTO Bcc CRM",
    },
    {
      type: CoachEventType.ToolResult,
      id: "rw2",
      ok: true,
      output: "…",
      durationMs: 2_400,
    },
    {
      type: CoachEventType.Text,
      delta:
        "Their CTO wrote that every customer reply must reach the CRM; nobody emailed about the address yet.",
    },
    {
      type: CoachEventType.Sources,
      sources: [
        {
          kind: SourceKind.Web,
          url: "https://docs.northwind-industries-holdings.example.com/engineering/blog/2026/10/why-every-customer-reply-must-land-in-the-crm-before-renewal?utm_source=newsletter&utm_medium=email",
          label: "docs.northwind-industries-holdings.example.com",
          title:
            "Why every customer reply must land in the CRM before renewal — Northwind Engineering Blog",
        },
        {
          kind: SourceKind.Email,
          url: "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0",
          label:
            "Re: Fwd: Re: Bcc on every reply before the Q4 renewal (Northwind × Contoso, EMEA)…",
          title:
            "Re: Fwd: Re: Bcc on every reply before the Q4 renewal\nAleksandra Wiśniewska-Kowalczyk",
        },
        {
          kind: SourceKind.Email,
          url: "https://mail.google.com/mail/u/0/#all/18f2b0d1e2f3a4b5",
          label: "طلب تفعيل النسخة المخفية لكل الردود",
          title: "طلب تفعيل النسخة المخفية لكل الردود",
        },
        {
          kind: SourceKind.Email,
          url: "https://mail.google.com/mail/u/0/#all/18f2c1c1c1c1c1c1",
          label: "(no subject)",
          title: "(no subject)\nJo",
        },
        {
          kind: SourceKind.Web,
          url: "https://x.co/a",
          label: "x.co",
          title: "https://x.co/a",
        },
      ],
    },
    {
      type: CoachEventType.Block,
      id: "rich-replies",
      block: {
        kind: BlockKind.Replies,
        options: [
          "Draft a reply to Aleksandra confirming the Bcc rollout dates",
          "اكتب ملخص للاجتماع عشان أبعته لفريق المبيعات على سلاك",
          "Summarise for Slack",
        ],
      },
    },
    {
      type: CoachEventType.Done,
      seconds: 14.2,
      ok: true,
      silent: false,
      interrupted: false,
    },
  ];
}

const MOVE_DONE: CoachEvent = {
  type: CoachEventType.Done,
  seconds: 3.4,
  ok: true,
  silent: false,
  interrupted: false,
};

const nudgeMove = (
  id: string,
  time: string,
  move: Move,
  talk?: TalkStats,
): CoachEvent[] => [
  {
    type: CoachEventType.User,
    kind: TurnKind.Nudge,
    text: `Question for you · ${time}`,
  },
  { type: CoachEventType.Block, id, block: { kind: BlockKind.Move, ...move } },
  ...(talk ? [{ type: CoachEventType.Talk, talk } satisfies CoachEvent] : []),
  MOVE_DONE,
];

const SHORT_MOVES: Move[] = [
  {
    tag: MoveTag.BuyingSignal,
    headline: "Book it",
    verb: MoveVerb.Ask,
    line: "Tuesday?",
  },
  {
    tag: MoveTag.GivingGround,
    headline: "Trade, don't give",
    verb: MoveVerb.Say,
    line: "Happy to, if we can sign this month.",
    moment: { speaker: "Jo", quote: "Can you throw in onboarding?" },
  },
  {
    tag: MoveTag.OverPromise,
    headline: "Walk back the date",
    verb: MoveVerb.Say,
    line: "Let me confirm the date with the team first.",
    watch_out: "X",
  },
  {
    tag: MoveTag.Agenda,
    headline: "Park it",
    verb: MoveVerb.Say,
    line: "Let's park SSO and come back at 3.",
    moment: { speaker: "Them", quote: "Also SSO?", at: "00:07" },
  },
  {
    tag: MoveTag.Risk,
    headline: "Get ahead of the new VP",
    verb: MoveVerb.Ask,
    line: "What will Dana want to see before she signs off?",
  },
];

function coaching(phase: Phase): CoachEvent[] {
  if (phase === Phase.Ended) {
    return [
      status({ busy: false, meeting: false }),
      waiting(ARABIC_TITLE),
      { type: CoachEventType.Wrapup, wrapUp: worstWrapUp(ARABIC_TITLE) },
    ];
  }
  return [
    status({ busy: false }),
    worstTranscript,
    ...nudgeMove("c-worst", "14:32", WORST_MOVE, TWELVE_SPEAKERS),
    ...nudgeMove(
      "c-all-you",
      "14:40",
      {
        tag: MoveTag.TalkTime,
        headline: "Stop and hand the floor back",
        verb: MoveVerb.Ask,
        line: "Does that match what you're seeing?",
      },
      talkOf([{ speaker: "You", ms: 600_000 }], 600_000, 600_000, 0),
    ),
    ...nudgeMove(
      "c-tiny",
      "14:48",
      {
        tag: MoveTag.TalkTime,
        headline: "Let them talk",
        verb: MoveVerb.Ask,
        line: "What else should I know?",
      },
      talkOf(
        [
          { speaker: "You", ms: 597_600 },
          { speaker: "Aleksandra Wiśniewska-Kowalczyk", ms: 2_400 },
        ],
        600_000,
        597_600,
        1,
      ),
    ),
    ...SHORT_MOVES.flatMap((move, index) =>
      nudgeMove(`c-short-${index}`, `15:0${index}`, move),
    ),
    {
      type: CoachEventType.User,
      kind: TurnKind.Catchup,
      text: "Catch me up · 15:12",
    },
    {
      type: CoachEventType.Tool,
      id: "cu1",
      name: "mcp__meeting__live_transcript",
      label: "Read the transcript",
      activeLabel: "Reading the transcript",
      detail: "since ms: 0",
    },
    {
      type: CoachEventType.ToolResult,
      id: "cu1",
      ok: true,
      output: "…",
      durationMs: 400,
    },
    {
      type: CoachEventType.Text,
      delta:
        "- **Now:** Aleksandra is weighing whether the partner desk in Kraków can go live without integration replies in the Bcc.\n- **Open for you:** نور الهدى asked whether Bcc covers every reply or only tickets.\n- **Promised:** you send the setup steps today; Christopher shares the session IDs, no date yet.",
    },
    {
      type: CoachEventType.Block,
      id: "c-catchup-move",
      block: {
        kind: BlockKind.Move,
        tag: MoveTag.VaguePromise,
        headline: "Pin Christopher's date",
        verb: MoveVerb.Ask,
        line: "Christopher, can you send the two session IDs by Thursday?",
        moment: {
          speaker: "Christopher Alexander Montgomery III",
          quote: "I'll dig those out.",
          at: "48:10",
        },
      },
    },
    {
      type: CoachEventType.Talk,
      talk: talkOf(
        [
          { speaker: "Aleksandra Wiśniewska-Kowalczyk", ms: 420_000 },
          { speaker: "Jo", ms: 180_000 },
        ],
        600_000,
        0,
        0,
      ),
    },
    MOVE_DONE,
    {
      type: CoachEventType.User,
      kind: TurnKind.Ask,
      text: "What's our list price for 40 seats, and how do I answer?",
    },
    {
      type: CoachEventType.Text,
      delta: "**€38,400 a year** (40 × €80/month, `pricing/2026.md:12`).",
    },
    {
      type: CoachEventType.Block,
      id: "c-ask-move",
      block: {
        kind: BlockKind.Move,
        tag: MoveTag.Pushback,
        headline: "Anchor on value before price",
        verb: MoveVerb.Ask,
        line: "Before I share numbers, what would solving the CRM gap be worth to the team?",
      },
    },
    MOVE_DONE,
  ];
}

const BUILDERS: Record<DataSet, (phase: Phase) => CoachEvent[]> = {
  worst,
  empty,
  one,
  huge,
  rich,
  coaching,
};

export function isDataSet(name: string | null): name is DataSet {
  return name !== null && name in BUILDERS;
}

export function dataSetState(name: DataSet, phase: Phase): CoachState {
  return BUILDERS[name](phase).reduce(
    (state, event) => reduce(state, { type: ActionType.Event, event }),
    reduce(initialState, {
      type: ActionType.Connection,
      connection: Connection.Open,
    }),
  );
}
