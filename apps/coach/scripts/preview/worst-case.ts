import type { CoachEvent, StatusEvent, WrapUpView } from "../../src/protocol";
import { screenshotThumb } from "../../src/ui/fixtures";
import { type CoachState, initialState, reduce } from "../../src/ui/state";

// Dev-only fixtures for the preview's "Demo data / Worst case / Empty / One / Huge" toggle.
// Every value is something a real meeting, model or project can produce; limits are noted where the
// server clips (turn-events.ts DETAIL_MAX 400 / OUTPUT_MAX 4_000, errors.ts DETAIL_MAX 2_000,
// server.ts keeps the last 6 transcript lines). Meeting titles, speaker names, prompts, answers,
// question text and wrap-up fields are unbounded.

export type DataSet = "worst" | "empty" | "one" | "huge" | "rich";
export type Phase = "live" | "ended";

const LONG_PATH =
  "/Users/aleksandra.wisniewska-kowalczyk/work/clients/northwind-industries-holdings/customer-success-playbooks";

const status = (overrides: Partial<StatusEvent> = {}): StatusEvent => ({
  type: "status",
  project: {
    path: LONG_PATH,
    source: "series",
    series: "Northwind Industries Holdings × Contoso — Weekly implementation sync (EMEA, rescheduled)",
    defaultProject: "/Users/aleksandra.wisniewska-kowalczyk/work/contoso-platform-monorepo-main",
  },
  model: "sonnet",
  busy: true,
  appConnected: true,
  meeting: true,
  proactive: {
    state: "capped",
    nudgesUsd: 100.0042,
    capUsd: 100,
    meetingUsd: 1_234.5678,
    meetingTokens: 125_000_000,
    cachedTokens: 120_000_000,
  },
  ...overrides,
});

const WORST_TITLE =
  "Northwind Industries Holdings × Contoso — Weekly implementation sync: Email Bcc rollout, WhatsApp open sessions & SSO (rescheduled from Tue)";
const ARABIC_TITLE = "اجتماع المتابعة الأسبوعي مع فريق المبيعات والدعم الفني بخصوص تفعيل النسخة المخفية";

const worstTranscript: CoachEvent = {
  type: "transcript",
  strip: { state: "live", title: WORST_TITLE, startedAt: Date.now() - 4_512_000 },
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
    { speaker: "نور الهدى عبد الرحمن", you: false, text: "يعني الـ Bcc بيشتغل على كل الـ replies ولا على الـ tickets بس؟" },
    { speaker: "Speaker 12", you: false, text: "https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved" },
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
    type: "tool",
    id: "w1",
    name: "Read",
    label: "Read resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
    activeLabel: "Reading resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
    detail: "/Users/aleksandra.wisniewska-kowalczyk/work/contoso-platform-monorepo-main/backend/src/email-channel/service/__tests__/resolve-outbound-bcc-recipients-for-ticketing-integrations.test.ts",
  },
  {
    type: "tool_result",
    id: "w1",
    ok: true,
    output: `${"{\"recipients\":[\"bartholomew.fitzgerald@northwind-industries-holdings.example.com\",\"first.last+billing-notifications@example.com\"],\"inboxId\":\"9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f\",\"organizationId\":\"e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f\"}".repeat(18).slice(0, 3_999)}…`,
    durationMs: 120,
  },
  {
    type: "tool",
    id: "w2",
    name: "Grep",
    label: "Searched for “outbound_bcc_addresses|bcc_recipients|crmDro…”",
    activeLabel: "Searching for “outbound_bcc_addresses|bcc_recipients|crmDro…”",
    detail: "outbound_bcc_addresses|bcc_recipients|crmDropbox|forward_copy in backend/src",
  },
  { type: "tool_result", id: "w2", ok: true, output: null, durationMs: 900 },
  {
    type: "tool",
    id: "w3",
    name: "mcp__contoso__get_session_structured_field_values",
    label: "contoso · get session structured field values",
    activeLabel: "contoso · get session structured field values",
    detail:
      'session id: 9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f\norganization id: e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f\nfields: ["crm_dropbox_address","bcc_enabled","ticketing_integration","region","partner_desk","renewal_risk","account_executive_email"]',
  },
  {
    type: "tool_result",
    id: "w3",
    ok: false,
    output:
      "MCP error -32603: Request failed with status 504 Gateway Timeout at https://example.com/api/v2/organizations/e788a9ad-1f2b-4c3d-9e8f-7a6b5c4d3e2f/sessions/9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f/structured-field-values?include=definitions,variants,groups",
    durationMs: 30_000,
  },
  {
    type: "tool",
    id: "w4",
    name: "Bash",
    label: "Ran git log --oneline -n 20 -- backend/src/email-channel/se…",
    activeLabel: "Running git log --oneline -n 20 -- backend/src/email-channel/se…",
    detail: "git log --oneline -n 20 -- backend/src/email-channel/service/resolve-outbound-bcc-recipients-for-ticketing-integrations.ts",
  },
  { type: "tool_result", id: "w4", ok: true, output: "4d2f1a9 fix email threading: emit Message-ID and In-Reply-To headers", durationMs: 300 },
];

const longPrompt = `Can you check whether they can Bcc every reply to their CRM? Context from Aleksandra: "we lost two renewals because nobody saw the thread", the address is bartholomew.fitzgerald@northwind-industries-holdings.example.com
Also look at https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved`;

const usage = (contextTokens: number): CoachEvent => ({
  type: "usage",
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

const worstConversation: CoachEvent[] = [
  { type: "divider", text: "Picked up where you left off after the app restarted during Northwind Industries Holdings weekly sync" },
  { type: "user", kind: "ask", text: longPrompt },
  ...worstSteps,
  { type: "text", delta: ANSWER },
  usage(191_000),
  { type: "done", seconds: 41.7, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "nudge", text: "Question for you · 14:32" },
  {
    type: "text",
    delta:
      "- **Unanswered:** نور الهدى asked whether Bcc applies to every reply or only tickets.\n- **You promised** to send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps today.",
  },
  { type: "done", seconds: 4.1, ok: true, silent: false, interrupted: false },
  { type: "user", kind: "ask", text: "اكتب ملاحظة إن العميل محتاج الـ Bcc قبل التجديد" },
  {
    type: "tool",
    id: "e1",
    name: "mcp__meeting__update_note",
    label: "Wrote to the notes",
    activeLabel: "Writing to the notes",
    detail: "markdown: - العميل محتاج الـ Bcc قبل التجديد",
  },
  {
    type: "edit",
    edit: {
      id: "edit-w1",
      session_id: "m1",
      kind: "note",
      summary: "- العميل محتاج الـ Bcc على كل الردود قبل التجديد في الربع الرابع، وإلا مش هيوسّعوا لباقي المناطق",
      task_id: null,
    },
  },
  { type: "tool_result", id: "e1", ok: true, output: "Added.", durationMs: 140 },
  {
    type: "tool",
    id: "e2",
    name: "mcp__meeting__add_action_item",
    label: "Added an action item",
    activeLabel: "Adding an action item",
    detail: "text: Send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps and the two session IDs that stayed open on WhatsApp since 14 September",
  },
  {
    type: "edit",
    edit: {
      id: "edit-w2",
      session_id: "m1",
      kind: "add_action_item",
      summary: "Send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps and the two session IDs that stayed open on WhatsApp since 14 September",
      task_id: "task-1",
    },
  },
  { type: "undone", id: "edit-w1", summary: "" },
  { type: "tool_result", id: "e2", ok: true, output: "Added.", durationMs: 210 },
  { type: "text", delta: "تمام، ضفت الملاحظة." },
  { type: "done", seconds: 3.2, ok: true, silent: false, interrupted: false },
  {
    type: "edit",
    edit: {
      id: "edit-w3",
      session_id: "m1",
      kind: "complete_action_item",
      summary: "Q3 Board Deck — FINAL (revised) v12 [approved by legal].pdf",
      task_id: "task-2",
    },
  },
  { type: "user", kind: "ask", text: "What did Jo just say?" },
  {
    type: "error",
    error: {
      kind: "auth",
      title: "Claude sign-in expired",
      message: "Open Terminal, run `claude`, and type `/login`. Then try again.",
      detail: `Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired. Please obtain a new token or refresh your existing token."},"request_id":"req_011CUZ9f8e7d6c5b4a4c3d8e2f1a0b9c8d7e6f"}\n    at /Users/aleksandra.wisniewska-kowalczyk/work/anarlog-eval/anarlog/apps/desktop/src-tauri/target/debug/bundle/macos/Cue Dev.app/Contents/MacOS/anarlog-claude:1:28471923`,
    },
  },
  { type: "done", seconds: 1.2, ok: false, silent: false, interrupted: false },
  { type: "notice", text: "That edit can no longer be undone here because a new meeting started in a different series folder." },
  { type: "user", kind: "ask", text: "Draft a reply to Aleksandra" },
  { type: "tool", id: "q1", name: "AskUserQuestion", label: "Asked you a question", activeLabel: "Waiting for your answer", detail: null },
  {
    type: "question",
    id: "q1",
    questions: [
      {
        question:
          "How formal should the reply to Aleksandra Wiśniewska-Kowalczyk be, given she escalated the lost renewals to her VP last week?",
        header: "Tone of the reply",
        multiSelect: false,
        options: [
          { label: "Neutral professional (Recommended)", description: "Polite, plain, no filler. Safe default for a customer or partner who escalated." },
          { label: "Warm", description: "" },
          { label: "Benachrichtigungseinstellungen-konform und förmlich", description: "Formal German register, the way their legal team writes" },
          { label: "بالعربي", description: "شبه رسمي، نفس المحتوى" },
        ],
      },
      {
        question: "Which points should it cover?",
        header: "Scope",
        multiSelect: true,
        options: [
          { label: "Bcc setup", description: "Steps for outbound_bcc_addresses" },
          { label: "WhatsApp sessions", description: "The two session IDs that stayed open since 14 September" },
        ],
      },
    ],
  },
];

const worstWrapUp = (title: string): WrapUpView => ({
  state: "ready",
  title,
  wrapUp: {
    commitments: [
      { who: "You", what: "send Aleksandra Wiśniewska-Kowalczyk the Bcc setup steps", when: "today" },
      {
        who: "Christopher Alexander Montgomery III",
        what: "share the two WhatsApp session IDs that stayed open since 14 September, plus screenshots of the agent view showing them as still assigned",
        when: "by end of day Thursday 16 October (Riyadh time), before the renewal call with procurement",
      },
      { who: "Them", what: "confirm the CRM dropbox address", when: null },
      { who: "Jo", what: "invite bartholomew.fitzgerald@northwind-industries-holdings.example.com", when: "Fri" },
      { who: "نور الهدى عبد الرحمن", what: "ترسل قائمة بالفرق اللي محتاجة نسخة", when: "الأسبوع الجاي" },
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
          moment: "[14:22] Christopher Alexander Montgomery III asked whether Bcc applies to replies a ticketing integration delivers, and the conversation moved on to pricing before anyone answered",
          instead: 'Ask: "Before we move on, can I come back to you by Thursday on whether integration replies get the Bcc too?"',
        },
        { moment: "[22:10] نور الهدى قالت \"الأسبوع الجاي\"", instead: 'اسأل: "تمام، ينفع نقول يوم الثلاثاء؟ ومين هيبعت القائمة؟"' },
        { moment: "[27:45] You talked for four minutes straight", instead: "Stop after the first answer and ask what they think." },
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
});

const waiting = (lastTitle: string | null): CoachEvent => ({ type: "transcript", strip: { state: "waiting", lastTitle, endedAt: lastTitle ? Date.now() - 90_000 : null }, lines: [], pending: "" });

function worst(phase: Phase): CoachEvent[] {
  if (phase === "ended") {
    return [
      status({ busy: false, meeting: false }),
      waiting(ARABIC_TITLE),
      ...worstConversation.slice(0, 26),
      { type: "wrapup", wrapUp: worstWrapUp(ARABIC_TITLE) },
    ];
  }
  return [status(), worstTranscript, ...worstConversation];
}

function empty(phase: Phase): CoachEvent[] {
  if (phase === "ended") {
    return [
      status({ busy: false, meeting: false }),
      waiting("Untitled"),
      {
        type: "wrapup",
        wrapUp: {
          state: "ready",
          title: null,
          wrapUp: { commitments: [], open_questions: [], follow_up_draft: "", coaching: { went_well: [], next_time: [] } },
          commitments: [],
          actions: { addActionItems: { enabled: false, hint: null }, logToClients: { enabled: false, hint: null } },
          added: false,
          logged: false,
        },
      },
    ];
  }
  return [
    status({ busy: false, project: { path: "/", source: "default", series: null, defaultProject: "/" } }),
    { type: "transcript", strip: { state: "live", title: "Untitled", startedAt: null }, lines: [], pending: "" },
  ];
}

function one(phase: Phase): CoachEvent[] {
  const base: CoachEvent[] = [
    status({ busy: phase === "live", project: { path: "/Users/jo/a", source: "default", series: "J", defaultProject: "/Users/jo/a" } }),
    phase === "live"
      ? { type: "transcript", strip: { state: "live", title: "J", startedAt: Date.now() - 5_000 }, lines: [{ speaker: "Jo", you: false, text: "Ok." }], pending: "" }
      : waiting("J"),
    { type: "user", kind: "ask", text: "?" },
    { type: "tool", id: "o1", name: "Glob", label: "Searched files", activeLabel: "Searching files", detail: "*" },
    { type: "tool_result", id: "o1", ok: true, output: "a", durationMs: 1 },
    { type: "text", delta: "1" },
    usage(100_000),
    { type: "done", seconds: 1, ok: true, silent: false, interrupted: false },
  ];
  if (phase === "ended") {
    return [
      ...base,
      {
        type: "wrapup",
        wrapUp: {
          state: "ready",
          title: "J",
          wrapUp: { commitments: [{ who: "Jo", what: "call", when: null }], open_questions: ["Why?"], follow_up_draft: "Thanks.", coaching: { went_well: [], next_time: [{ moment: "[00:01] Jo", instead: "Ask." }] } },
          commitments: [],
          actions: { addActionItems: { enabled: true, hint: null }, logToClients: { enabled: false, hint: null } },
          added: false,
          logged: false,
        },
      },
    ];
  }
  return [
    ...base,
    { type: "user", kind: "ask", text: "Reply?" },
    { type: "tool", id: "oq", name: "AskUserQuestion", label: "Asked you a question", activeLabel: "Waiting for your answer", detail: null },
    {
      type: "question",
      id: "oq",
      questions: [{ question: "Send it?", header: "Q", multiSelect: false, options: [{ label: "Yes", description: "" }] }],
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
    phase === "live" ? worstTranscript : waiting(WORST_TITLE),
  ];
  for (let turn = 0; turn < 199; turn += 1) {
    events.push(
      { type: "user", kind: turn % 10 === 9 ? "nudge" : "ask", text: turn % 10 === 9 ? `You were mentioned · ${String(9 + Math.floor(turn / 30)).padStart(2, "0")}:${String((turn * 7) % 60).padStart(2, "0")}` : `Question ${turn + 1}: what did they just ask about the Bcc rollout?` },
      { type: "tool", id: `h${turn}`, name: "mcp__meeting__live_transcript", label: "Read the transcript", activeLabel: "Reading the transcript", detail: null },
      { type: "tool_result", id: `h${turn}`, ok: true, output: "…", durationMs: 300 },
      { type: "text", delta: `Answer ${turn + 1}: Aleksandra asked whether every reply is copied to the CRM.` },
      { type: "done", seconds: 3, ok: true, silent: false, interrupted: false },
    );
  }
  events.push({ type: "user", kind: "ask", text: "Walk me through everything about Bcc, in detail." });
  for (let step = 0; step < 50; step += 1) {
    events.push(
      { type: "tool", id: `s${step}`, name: step % 2 ? "Grep" : "Read", label: step % 2 ? `Searched for “bcc_${step}”` : `Read outbound-${step}.ts`, activeLabel: "Reading", detail: `backend/src/email-channel/service/outbound-${step}.ts` },
      { type: "tool_result", id: `s${step}`, ok: step % 17 !== 0, output: `line ${step}`, durationMs: 100 },
    );
  }
  let answer = "";
  while (answer.length < 30_000) answer += HUGE_SECTION;
  events.push({ type: "text", delta: answer.slice(0, 30_000) }, usage(150_000), { type: "done", seconds: 88, ok: true, silent: false, interrupted: false });
  if (phase === "ended") events.push({ type: "wrapup", wrapUp: worstWrapUp(WORST_TITLE) });
  return events;
}

// Rich blocks: the show tool allows up to 30 action items (text ≤ 300, owner ≤ 80, due ≤ 60) and 2–3
// follow-ups (≤ 60 chars); source chips are capped at 5 with labels clipped to 80; images are capped at 4
// per ask with thumbnails ≤ 192px on the long edge, any aspect.
const LONG_ITEM =
  "share the two WhatsApp session IDs that stayed open since 14 September, plus screenshots of the agent view showing them as still assigned to bartholomew.fitzgerald@northwind-industries-holdings.example.com, and confirm with procurement that the renewal call can move to the week after the Bcc rollout lands";

const RICH_ITEMS = [
  { text: LONG_ITEM, owner: "Christopher Alexander Montgomery III", due: "by end of day Thursday 16 October (Riyadh time)" },
  { text: "ترسل قائمة بالفرق اللي محتاجة نسخة من كل رد قبل التجديد", owner: "نور الهدى عبد الرحمن", due: "الأسبوع الجاي" },
  { text: "invite https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved", owner: "Jo" },
  { text: "X", owner: "You" },
  ...Array.from({ length: 26 }, (_, index) => ({
    text: `follow up on open question ${index + 5} about the Bcc rollout`,
    ...(index % 3 === 0 ? { owner: "Aleksandra Wiśniewska-Kowalczyk" } : {}),
    ...(index % 4 === 0 ? { due: "Fri" } : {}),
  })),
];

const thumb = (width: number, height: number, label: string) => ({ thumb: screenshotThumb(width, height, label), width, height });

function rich(phase: Phase): CoachEvent[] {
  const edit = (id: string, index: number, summary: string): CoachEvent => ({
    type: "edit",
    edit: { id, session_id: "m1", kind: "add_action_item", summary, task_id: id },
    block: { id: "rich-actions", index },
  });
  return [
    status({ busy: false, meeting: phase === "live" }),
    phase === "live" ? worstTranscript : waiting(WORST_TITLE),
    {
      type: "user",
      kind: "ask",
      text: "Here are the screenshots from Aleksandra Wiśniewska-Kowalczyk's team — what's wrong with the agent view? https://example.com/workspaces/northwind/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments",
      images: [thumb(192, 8, "panorama"), thumb(8, 192, "tall"), thumb(1, 1, ""), thumb(192, 144, "Agent view")],
    },
    { type: "text", delta: "Both sessions are still assigned to an agent who went offline on 14 September, so they never auto-close." },
    { type: "done", seconds: 9.4, ok: true, silent: false, interrupted: false },
    { type: "user", kind: "ask", text: "Show me every diagram we have for the Bcc rollout" },
    {
      type: "text",
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
    { type: "done", seconds: 6.3, ok: true, silent: false, interrupted: false },
    { type: "user", kind: "ask", text: "", images: [thumb(144, 192, "Settings")] },
    { type: "text", delta: "That's the inbox settings page; Outbound Bcc addresses is the third field." },
    { type: "done", seconds: 3.1, ok: true, silent: false, interrupted: false },
    { type: "user", kind: "ask", text: "List every promise from this call as action items" },
    { type: "tool", id: "rw1", name: "mcp__meeting__live_transcript", label: "Read the transcript", activeLabel: "Reading the transcript", detail: null },
    { type: "tool_result", id: "rw1", ok: true, output: "…", durationMs: 380 },
    { type: "text", delta: "Thirty promises; most are follow-ups on open questions." },
    { type: "block", id: "rich-actions", block: { kind: "actions", items: RICH_ITEMS } },
    { type: "block_check", id: "rich-actions", index: 1, checked: true },
    { type: "block_check", id: "rich-actions", index: 3, checked: true },
    edit("rich-e1", 0, LONG_ITEM),
    edit("rich-e2", 2, "Jo: invite …"),
    { type: "undone", id: "rich-e2", summary: "" },
    edit("rich-e3", 1, RICH_ITEMS[1]?.text ?? ""),
    { type: "done", seconds: 12.6, ok: true, silent: false, interrupted: false },
    { type: "user", kind: "ask", text: "What does their CTO say publicly about Bcc, and did anyone email us?" },
    { type: "tool", id: "rw2", name: "WebSearch", label: "Searched the web for “Northwind Industries Holdings CTO Bcc C…”", activeLabel: "Searching the web for “Northwind Industries Holdings CTO Bcc C…”", detail: "query: Northwind Industries Holdings CTO Bcc CRM" },
    { type: "tool_result", id: "rw2", ok: true, output: "…", durationMs: 2_400 },
    { type: "text", delta: "Their CTO wrote that every customer reply must reach the CRM; nobody emailed about the address yet." },
    {
      type: "sources",
      sources: [
        {
          kind: "web",
          url: "https://docs.northwind-industries-holdings.example.com/engineering/blog/2026/10/why-every-customer-reply-must-land-in-the-crm-before-renewal?utm_source=newsletter&utm_medium=email",
          label: "docs.northwind-industries-holdings.example.com",
          title: "Why every customer reply must land in the CRM before renewal — Northwind Engineering Blog",
        },
        {
          kind: "email",
          url: "https://mail.google.com/mail/u/0/#all/18f2a9c4b7e1d3a0",
          label: "Re: Fwd: Re: Bcc on every reply before the Q4 renewal (Northwind × Contoso, EMEA)…",
          title: "Re: Fwd: Re: Bcc on every reply before the Q4 renewal\nAleksandra Wiśniewska-Kowalczyk",
        },
        { kind: "email", url: "https://mail.google.com/mail/u/0/#all/18f2b0d1e2f3a4b5", label: "طلب تفعيل النسخة المخفية لكل الردود", title: "طلب تفعيل النسخة المخفية لكل الردود" },
        { kind: "email", url: "https://mail.google.com/mail/u/0/#all/18f2c1c1c1c1c1c1", label: "(no subject)", title: "(no subject)\nJo" },
        { kind: "web", url: "https://x.co/a", label: "x.co", title: "https://x.co/a" },
      ],
    },
    {
      type: "block",
      id: "rich-replies",
      block: {
        kind: "replies",
        options: [
          "Draft a reply to Aleksandra confirming the Bcc rollout dates",
          "اكتب ملخص للاجتماع عشان أبعته لفريق المبيعات على سلاك",
          "Summarise for Slack",
        ],
      },
    },
    { type: "done", seconds: 14.2, ok: true, silent: false, interrupted: false },
  ];
}

const BUILDERS: Record<DataSet, (phase: Phase) => CoachEvent[]> = { worst, empty, one, huge, rich };

export function isDataSet(name: string | null): name is DataSet {
  return name !== null && name in BUILDERS;
}

export function dataSetState(name: DataSet, phase: Phase): CoachState {
  return BUILDERS[name](phase).reduce(
    (state, event) => reduce(state, { type: "event", event }),
    reduce(initialState, { type: "connection", connection: "open" }),
  );
}
