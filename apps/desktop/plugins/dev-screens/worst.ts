// Worst-case data for the screen harness (break-ui): the same shape as the
// demo, with every value pushed to what a real user produces. Long and
// unbreakable names, emails, URLs and paths; one-letter and missing values;
// Arabic, Hebrew, CJK, emoji and ZWJ sequences; 45 participants; a 12-hour
// transcript with unknown speakers; dense calendar days; thousands of files.
// The first rows of every list carry different failures, as real data does.
import {
  bullets,
  type CalendarEvent,
  type Dataset,
  DAY,
  doc,
  heading,
  HOUR,
  MAIN_SESSION,
  MINUTE,
  paragraph,
  type Person,
  SELF_ID,
  type Session,
  tasks,
  today,
  type Turn,
} from "./dataset";

const NORTHWIND = "org-northwind";
const LONG_URL =
  "https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved";
const LONG_EMAIL =
  "bartholomew.fitzgerald@northwind-industries-holdings.example.com";
const LONG_PATH =
  "/Users/aleksandra.wisniewska-kowalczyk/Library/CloudStorage/GoogleDrive-aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com/Shared drives/Enterprise Onboarding/Q4 2026/Meeting notes";
const LONG_FOLDER =
  "Clients/Northwind Industries Holdings International/Enterprise onboarding — Q4 2026";

const NAMED: Person[] = [
  {
    id: SELF_ID,
    name: "Aleksandra Wiśniewska-Kowalczyk",
    email:
      "aleksandra.wisniewska-kowalczyk@northwind-industries-holdings.example.com",
    title: "Senior Product Design Engineer, Platform Infrastructure",
    org: NORTHWIND,
  },
  {
    id: "human-christopher",
    name: "Christopher Alexander Montgomery III",
    email: "christopher.montgomery@sub.department.region.example.co.uk",
    title:
      "Vice President, Strategic Partnerships and Enterprise Alliances (EMEA)",
    org: NORTHWIND,
  },
  {
    id: "human-konstantin",
    name: "Konstantin Oberhauser-Wettstein",
    email: LONG_EMAIL,
    title: "Head of Revenue Operations",
    org: NORTHWIND,
  },
  { id: "human-jo", name: "Jo", email: "a@b.co", title: "", org: "" },
  { id: "human-j", name: "J", email: "", title: "", org: "" },
  {
    id: "human-nour",
    name: "نور الهدى عبد الرحمن",
    email: "nour.abdelrahman@jisr.example.sa",
    title: "مديرة نجاح العملاء في منطقة الشرق الأوسط وشمال أفريقيا",
    org: "org-jisr",
  },
  {
    id: "human-olafur",
    name: "Ólafur Darri Ólafsson",
    email: "olafur@example.is",
    title: "CTO",
    org: "org-x",
  },
  {
    id: "human-dang",
    name: "Đặng Thị Ngọc Hân",
    email: "han.dang@example.vn",
    title: "Kỹ sư dữ liệu",
    org: "",
  },
  {
    id: "human-wang",
    name: "王秀英",
    email: "wang.xiuying@example.cn",
    title: "产品经理",
    org: "org-cjk",
  },
  {
    id: "human-yael",
    name: "יעל בן-דוד",
    email: "yael@example.co.il",
    title: "מנהלת מוצר",
    org: "",
  },
  {
    id: "human-sean",
    name: "Seán O'Brien-Ó Súilleabháin",
    email: "sean.obrien@example.ie",
    title: "Solutions architect",
    org: NORTHWIND,
  },
  {
    id: "human-maria",
    name: "María José de la Cruz y Fernández",
    email: "first.last+billing-notifications@example.com",
    title: "Finance",
    org: NORTHWIND,
  },
  {
    id: "human-dana",
    name: "dana",
    email: "dana@example.org",
    title: "",
    org: "org-lumen",
  },
  {
    id: "human-fox",
    name: "🦊 Fox",
    email: "fox@example.com",
    title: "",
    org: "org-lumen",
  },
  {
    id: "human-priya",
    name: "👩🏽‍💻 Priya",
    email: "priya@example.com",
    title: "Staff engineer",
    org: "org-lumen",
  },
  {
    id: "human-sam",
    name: "  Sam   Lee ",
    email: "sam.lee@example.com",
    title: "",
    org: "",
  },
  {
    id: "human-noname",
    name: "",
    email: "ops@sub.department.region.example.co.uk",
    title: "",
    org: NORTHWIND,
  },
  {
    id: "human-tanaka",
    name: "田中 美咲",
    email: "misaki.tanaka@example.jp",
    title: "営業部長",
    org: "org-cjk",
  },
  {
    id: "human-omer",
    name: "Ömer Aydın",
    email: "omer@lumen.example",
    title: "Head of Product",
    org: "org-lumen",
  },
];

const MORE_NAMES = [
  "Amara Okonkwo",
  "Lukas Bäumler",
  "Isabela Gonçalves Ribeiro",
  "Mateusz Wójcik",
  "Freya Halvorsen",
  "Rahul Venkataraman",
  "Chloé Lefèvre-Dumont",
  "Tomás Ó Floinn",
  "Ingrid Søndergaard",
  "Kwame Mensah-Bonsu",
  "Aiyana Whitehorse",
  "Dmitri Volkonsky",
  "Sofia Papadopoulou",
  "Hiroshi Watanabe",
  "Zainab Al-Farsi",
  "Benedikt Schwarzenegger-Hofmann",
  "Ngozi Adeyemi",
  "Pieter van der Westhuizen",
  "Mei-Ling Huang",
  "Oluwaseun Bankole",
  "Gabriela Szymańska",
  "Arjun Bhattacharya",
  "Elif Yıldırım",
  "Mohammed bin Rashid Al-Qasimi",
  "Saoirse Ní Bhriain",
  "Thandiwe Dlamini",
];

const PEOPLE: Person[] = [
  ...NAMED,
  ...MORE_NAMES.map((name, index) => ({
    id: `human-more-${index}`,
    name,
    email: `${name
      .normalize("NFD")
      .replace(/[^\w ]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ".")}@northwind-industries-holdings.example.com`,
    title: index % 3 === 0 ? "" : "Account executive, enterprise",
    org: index % 2 === 0 ? NORTHWIND : "org-lumen",
  })),
];

const ORGANIZATIONS = [
  {
    id: NORTHWIND,
    name: "Northwind Industries Holdings International GmbH & Co. KG",
  },
  { id: "org-lumen", name: "Lumen" },
  { id: "org-x", name: "X" },
  { id: "org-jisr", name: "شركة جسر للحلول التقنية" },
  { id: "org-cjk", name: "株式会社サンプル・ソリューションズ" },
];

const CLIENTS = [
  "Acme Corporation",
  "Globex",
  "Initech",
  "Umbrella Health",
  "Stark Industries",
  "Wayne Enterprises",
  "Soylent",
  "Hooli",
  "Pied Piper",
  "Vandelay Industries",
  "Cyberdyne Systems",
  "Tyrell Corporation",
  "Wonka Industries",
  "Gringotts",
  "Monsters, Inc.",
  "Oceanic Airlines",
  "Dunder Mifflin Paper Company",
  "Prestige Worldwide",
  "Sterling Cooper Draper Pryce",
  "Bluth Company",
  "Massive Dynamic",
  "Aperture Science",
  "Black Mesa Research Facility",
  "Weyland-Yutani",
];

const FOLDERS = [
  "Clients",
  "Clients/Northwind Industries Holdings International",
  LONG_FOLDER,
  "Clients/Lumen",
  ...CLIENTS.map((name) => `Clients/${name}`),
  "عملاء",
  "عملاء/شركة جسر للحلول التقنية",
  "Hiring",
  "🚀 Launches",
  "Datenschutzgrundverordnungskonformitätsprüfung",
  "J",
];

const URL_LINE = `The doc is at ${LONG_URL} and the shared inbox is ${LONG_EMAIL}.`;

const MONOLOGUE = [
  "Let me walk through the whole migration plan, because I think the confusion comes from three different timelines being discussed in three different threads.",
  "The first is the pricing change: the seat tiers on the public page are still the old ones, and the annual plan we agreed for November is not reflected anywhere a buyer would look.",
  "The second is the WhatsApp number. We keep the shared number until the migration is done, which means the routing rules on our side have to stay exactly as they are, including the after-hours fallback that sends everything to the Lisbon team.",
  "The third is the outbound email work. Bcc is live, but only for the new templates; anything that still uses the legacy sender will not copy the shared inbox until we move it, and that is roughly one thousand two hundred and eighty four templates across all regions.",
  "So when someone asks whether this is done, the honest answer is that one of the three is done, one is waiting on your side, and one is waiting on ours.",
].join(" ");

const TRANSCRIPT: Turn[] = [
  [SELF_ID, "Thanks for making the time. Shall we start with pricing?"],
  ["human-christopher", MONOLOGUE],
  [
    "human-nour",
    "ممتاز، وهل نحتفظ برقم واتساب الحالي حتى ننتهي من النقل؟ لأن فريق الدعم في الرياض يستقبل أكثر من ألف ومئتين وأربع وثمانين محادثة يوميًا على هذا الرقم، وأي تغيير مفاجئ سيسبب ارتباكًا كبيرًا للعملاء.",
  ],
  [
    "human-nour",
    "Also the dashboard link is https://app.example.com/ar/settings/channels/whatsapp/9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f — هل يمكنكم التحقق منه؟",
  ],
  ["human-jo", "Yes."],
  ["human-j", "ok"],
  [0, "Sorry, joining late from the conference room, can everyone hear me?"],
  [1, "We can hear you."],
  [
    "human-wang",
    "我们需要在十一月之前完成定价页面的更新，否则销售团队会继续使用旧的价格表。",
  ],
  ["human-tanaka", "了解しました。日本のチームにも共有します。"],
  [
    "human-yael",
    "אני אשלח את המסמך המעודכן עד סוף השבוע, כולל ההערות של צוות המכירות.",
  ],
  ["human-konstantin", URL_LINE],
  ["human-fox", "🙌🏽 👍🏽 💯"],
  ["human-priya", "👩🏽‍💻 I can pair on the routing rules on Thursday."],
  ["human-sam", "Same here."],
  [
    "human-noname",
    "This is ops. The shared number stays until the migration is done.",
  ],
  [2, "Can someone confirm the seat count? Is it 1,284 or 12,840?"],
  [13, "It is 1,284 seats across all regions."],
  [null, "(inaudible)"],
  ["human-maria", "Finance will invoice the annual plan from November 1."],
  [
    "human-sean",
    "Datenschutzgrundverordnungskonformitätsprüfung is still pending on their side, so legal cannot sign yet.",
  ],
  ["human-dang", "Tôi sẽ cập nhật bảng dữ liệu trước thứ Sáu."],
  ["human-olafur", "Ég sendi ykkur skjalið."],
  ["human-dana", "sounds good"],
  [
    SELF_ID,
    "Great. I will send everyone the summary and the setup steps today.",
  ],
];

const MAIN: Session = {
  id: MAIN_SESSION,
  title:
    "Weekly sync with Lumen: Q4 pricing, the WhatsApp number migration, outbound Bcc and who signs off the new seat count",
  offset: -13 * HOUR,
  duration: 12 * HOUR + 40 * MINUTE,
  folder: LONG_FOLDER,
  people: PEOPLE.map((person) => person.id),
  tags: [
    "design",
    "frontend",
    "q4",
    "urgent",
    "needs-review",
    "pricing",
    "whatsapp",
    "customer-feedback-from-enterprise-onboarding",
    "legal",
    "finance",
    "emea",
    "renewal",
  ],
  note: doc(
    paragraph(
      "Pricing page still shows the old seat tiers. 1,284 seats across all regions.",
    ),
    paragraph(URL_LINE),
    paragraph(
      "نراجع خطة الإطلاق مع فريق جسر يوم الأحد، ثم نرسل التحديث إلى Northwind.",
    ),
    bullets(
      "Bcc on outbound email is live",
      "WhatsApp sessions that stayed open: fixed on Monday",
    ),
  ),
  summary: doc(
    heading("Decisions"),
    bullets(
      "Move Northwind Industries Holdings International GmbH & Co. KG to the annual plan from November, with the two-month discount applied to all 1,284 seats",
      "Keep the WhatsApp channel on the shared number until the migration",
      `Track open items in ${LONG_URL}`,
    ),
    heading("Action items"),
    tasks(
      [
        "Christopher Alexander Montgomery III: send the Bcc setup steps to bartholomew.fitzgerald@northwind-industries-holdings.example.com",
        false,
      ],
      ["نور الهدى عبد الرحمن: مشاركة مسودة صفحة الأسعار مع فريق جسر", false],
      ["J: close the stale WhatsApp sessions", true],
      ["王秀英：更新定价页面", false],
    ),
    heading("Open questions"),
    bullets(
      "Who signs off the new seat count on their side?",
      "Datenschutzgrundverordnungskonformitätsprüfung: when does legal finish?",
    ),
    heading("Notes"),
    paragraph(MONOLOGUE),
  ),
  transcript: TRANSCRIPT,
};

const SESSIONS: Session[] = [
  MAIN,
  {
    id: "session-j",
    title: "J",
    offset: -3 * HOUR,
    people: [SELF_ID, "human-j"],
  },
  {
    id: "session-untitled",
    title: "",
    offset: -4 * HOUR,
    people: [SELF_ID],
  },
  {
    id: "session-url",
    title: LONG_URL,
    offset: -5 * HOUR,
    folder: "J",
    people: [SELF_ID, "human-jo"],
  },
  {
    id: "session-emoji",
    title: "👩🏽‍💻 Pairing with Priya 🦊🚀",
    offset: -6 * HOUR,
    folder: "🚀 Launches",
    people: [SELF_ID, "human-priya", "human-fox"],
    tags: ["pairing"],
  },
  {
    id: "session-hiring",
    title:
      "Hiring loop: Senior Product Design Engineer, Platform Infrastructure — final debrief",
    offset: -1 * DAY - 2 * HOUR,
    folder: "Hiring",
    people: [SELF_ID, "human-konstantin", "human-sean"],
    locked: true,
  },
  {
    id: "session-arabic",
    title:
      "مراجعة خطة الإطلاق مع فريق جسر وتحديد مواعيد التسليم النهائية للربع الرابع",
    offset: -1 * DAY - 5 * HOUR,
    folder: "عملاء/شركة جسر للحلول التقنية",
    people: [SELF_ID, "human-nour"],
    note: doc(
      paragraph(
        "نراجع خطة الإطلاق مع فريق جسر يوم الأحد. Northwind needs the Arabic copy by Q4.",
      ),
    ),
  },
  {
    id: "session-hebrew",
    title: "סקירת רבעון עם צוות המכירות",
    offset: -2 * DAY,
    people: [SELF_ID, "human-yael"],
  },
  {
    id: "session-cjk",
    title: "季度业务回顾：与合作伙伴讨论下一阶段的定价与上线计划",
    offset: -2 * DAY - 3 * HOUR,
    folder: "Clients/Acme Corporation",
    people: [SELF_ID, "human-wang", "human-tanaka"],
  },
  {
    id: "session-german",
    title:
      "Datenschutzgrundverordnungskonformitätsprüfung mit der Rechtsabteilung",
    offset: -3 * DAY,
    folder: "Datenschutzgrundverordnungskonformitätsprüfung",
    people: [SELF_ID, "human-sean"],
  },
  {
    id: "session-escape",
    title: '<script>alert(1)</script> & "Q&A" **bold**',
    offset: -4 * DAY,
    people: [SELF_ID],
  },
  {
    id: "session-newline",
    title: "Line one\nLine two",
    offset: -5 * DAY,
    people: [SELF_ID],
  },
  {
    id: "session-zero",
    title: "Quick check",
    offset: -6 * DAY,
    duration: 0,
    people: [SELF_ID, "human-dana"],
  },
  ...CLIENTS.slice(0, 8).map((client, index) => ({
    id: `session-client-${index}`,
    title: `${client} renewal`,
    offset: -(8 + index * 9) * DAY,
    folder: `Clients/${client}`,
    people: [SELF_ID, `human-more-${index}`],
  })),
  {
    id: "session-old",
    title: "Kick-off with Northwind",
    offset: -(3 * 365 + 40) * DAY,
    folder: "Clients/Northwind Industries Holdings International",
    people: [SELF_ID, "human-konstantin"],
  },
];

function dayAt(days: number, hour: number, minute = 0) {
  const date = today(hour, minute);
  date.setDate(date.getDate() + days);
  return date;
}

const ATTENDEES = PEOPLE.map(({ name, email }) => ({ name, email }));

const EVENTS: CalendarEvent[] = [
  {
    id: "event-qbr",
    title:
      "Quarterly business review with Northwind Industries Holdings International — pricing, renewal and the enterprise onboarding plan",
    start: new Date(Date.now() + 25 * MINUTE),
    minutes: 30,
    location:
      "Northwind HQ, Building 7, Floor 12, Conference Room “Aurora Borealis” (enter through the north lobby)",
    link: LONG_URL,
    participants: ATTENDEES,
  },
  { id: "event-standup", title: "Standup", start: today(9), minutes: 15 },
  { id: "event-j", title: "J", start: today(9, 15), minutes: 15 },
  {
    id: "event-german",
    title: "Datenschutzgrundverordnungskonformitätsprüfung",
    start: today(10),
    minutes: 60,
  },
  {
    id: "event-overlap",
    title: "Overlapping: design critique",
    start: today(10, 30),
    minutes: 60,
  },
  {
    id: "event-arabic",
    title: "اجتماع أسبوعي مع فريق جسر",
    start: today(11, 30),
    minutes: 30,
  },
  {
    id: "event-cjk",
    title: "季度业务回顾会议",
    start: today(12),
    minutes: 30,
  },
  {
    id: "event-emoji",
    title: "🍕 Team lunch 👩🏽‍💻",
    start: today(12, 30),
    minutes: 60,
  },
  {
    id: "event-zero",
    title: "Reminder: send the invoice",
    start: today(14),
    minutes: 0,
  },
  { id: "event-untitled", title: "", start: today(15), minutes: 30 },
  {
    id: "event-late",
    title: "Call with APAC",
    start: today(22, 30),
    minutes: 90,
  },
  {
    id: "event-offsite",
    title: "Offsite — Lisbon (all hands, travel days included)",
    start: dayAt(1, 0),
    minutes: 3 * 24 * 60,
    allDay: true,
  },
  {
    id: "event-tomorrow",
    title: "Northwind check-in",
    start: dayAt(1, 10),
    minutes: 45,
    participants: ATTENDEES.slice(0, 3),
  },
  ...[2, 3, 5, 8, 9].flatMap((days) =>
    Array.from({ length: 9 }, (_, index) => ({
      id: `event-dense-${days}-${index}`,
      title:
        index % 3 === 0
          ? `${CLIENTS[(days + index) % CLIENTS.length]} quarterly business review and renewal planning`
          : `${CLIENTS[(days + index) % CLIENTS.length]} sync`,
      start: dayAt(days, 8 + index, index % 2 ? 30 : 0),
      minutes: 45,
    })),
  ),
  {
    id: "event-past",
    title: "Interview: Konstantin Oberhauser-Wettstein",
    start: dayAt(-4, 11),
    minutes: 60,
  },
];

const TEMPLATES = [
  {
    id: "template-long",
    title:
      "Enterprise quarterly business review with renewal risk, expansion opportunities and executive sponsor alignment",
    description:
      "Use for every QBR with accounts over 1,000 seats. Covers health, adoption by region, open escalations, renewal risk, expansion and the next executive touchpoint.",
    sections: Array.from({ length: 14 }, (_, index) => ({
      title:
        index === 0
          ? "Account health across all regions and business units, including adoption by seat tier"
          : `Section ${index + 1}`,
      description:
        index === 0
          ? "Summarise health per region. Mention any region under 60% adoption and name the owner."
          : "",
    })),
  },
  {
    id: "template-arabic",
    title: "محضر اجتماع أسبوعي",
    description: "القرارات، المهام، والأسئلة المفتوحة",
    sections: [
      { title: "القرارات", description: "" },
      { title: "المهام", description: "مع اسم المسؤول والموعد" },
    ],
  },
  {
    id: "template-j",
    title: "J",
    description: "",
    sections: [],
  },
];

const CONNECTORS = [
  "Gmail",
  "Gmail (2)",
  "Google Drive (northwind-industries-holdings.example.com shared drives)",
  "Google Calendar",
  "Atlassian Confluence & Jira Service Management (Northwind EU tenant)",
  "Linear",
  "Notion",
  "Slack",
  "HubSpot CRM",
  "Salesforce Sales Cloud — Enterprise Edition (Production)",
  "Zendesk",
  "Intercom",
  "GitHub",
  "Figma",
  "Asana",
  "Datenschutzgrundverordnungskonformitätsprüfungsdienst",
  "سلة",
  "飞书",
].map((name, index) => ({
  name,
  id: `connector-${index}`,
  url: `https://mcp.example.com/connectors/${index}/${name.toLowerCase().replace(/\W+/g, "-")}`,
}));

const COACH_SETTINGS = {
  project: LONG_PATH,
  model: "opus",
  nudges: true,
  nudge_limit_cents: 128_400,
  mcp_servers: [
    {
      name: "northwind-internal-knowledge-base-production-eu-west-1",
      url: "https://mcp.internal.northwind-industries-holdings.example.com/v2/knowledge-base/production/eu-west-1/sse",
      auth: { kind: "bearer" },
      enabled: true,
    },
    { name: "J", url: "http://localhost:3000/mcp", enabled: false },
  ],
  claude_connectors: CONNECTORS.slice(0, 6).map((connector, index) => ({
    ...connector,
    allow_changes: index % 2 === 0,
  })),
  instructions: [
    "Always answer in the language the customer used. If they mix Arabic and English, answer in Arabic.",
    `Our pricing lives at ${LONG_URL}; never quote a number that is not on that page.`,
    MONOLOGUE,
    MONOLOGUE,
  ].join("\n\n"),
  knowledge: [
    LONG_PATH,
    "/Users/aleksandra.wisniewska-kowalczyk/Documents/Q3 Board Deck — FINAL (revised) v12 [approved by legal]",
    "/Volumes/Shared/عملاء/شركة جسر للحلول التقنية/عقود",
    "/J",
  ],
  web_access: true,
};

const WORKFLOWS = [
  {
    id: "workflow-long",
    title:
      "Export every enhanced note for Northwind Industries Holdings International to the shared Google Drive",
    enabled: true,
    trigger: "note_enhanced",
    steps: [
      {
        id: "step-long",
        type: "markdown_export",
        directory: LONG_PATH,
      },
    ],
    lastRun: {
      at: new Date(Date.now() - 12 * DAY).toISOString(),
      status: "error",
      detail: `EACCES: permission denied, open '${LONG_PATH}/Weekly sync with Lumen: Q4 pricing, the WhatsApp number migration, outbound Bcc and who signs off the new seat count.md'`,
    },
    processedSessionIds: Array.from({ length: 1284 }, (_, i) => `s-${i}`),
  },
  {
    id: "workflow-j",
    title: "J",
    enabled: false,
    trigger: "meeting_completed",
    steps: [],
    lastRun: null,
    processedSessionIds: [],
  },
  {
    id: "workflow-untitled",
    title: "",
    enabled: true,
    trigger: "meeting_completed",
    steps: [{ id: "step-empty", type: "markdown_export", directory: "" }],
    lastRun: {
      at: new Date().toISOString(),
      status: "success",
      detail: "Exported 1 note",
    },
    processedSessionIds: ["s-1"],
  },
];

const DICTIONARY = [
  "Datenschutzgrundverordnungskonformitätsprüfung",
  "Northwind Industries Holdings International GmbH & Co. KG",
  "northwind-industries-holdings.example.com",
  LONG_EMAIL,
  "Wiśniewska-Kowalczyk",
  "Oberhauser-Wettstein",
  "Ó Súilleabháin",
  "Đặng Thị Ngọc Hân",
  "王秀英",
  "田中 美咲",
  "نور الهدى",
  "جسر",
  "יעל",
  "👩🏽‍💻",
  "J",
  "QBR",
  "WhatsApp",
  "Bcc",
  "OpenCX",
  ...CLIENTS,
  ...MORE_NAMES,
  ...Array.from({ length: 60 }, (_, index) => `SKU-${1000 + index * 37}`),
];

export const worst = (): Dataset => ({
  people: PEOPLE,
  organizations: ORGANIZATIONS,
  folders: FOLDERS,
  sessions: SESSIONS,
  events: EVENTS,
  templates: TEMPLATES,
  settings: {
    sidebar_show_tags: true,
    use_24_hour_time: false,
    spoken_languages: JSON.stringify([
      "ar",
      "he",
      "zh",
      "ja",
      "de",
      "fr",
      "es",
      "pt",
      "tr",
      "pl",
      "vi",
      "hi",
    ]),
    personalization_dictionary_terms: JSON.stringify(DICTIONARY),
    automation_workflows: JSON.stringify(WORKFLOWS),
    custom_summary_instructions: COACH_SETTINGS.instructions,
    export_directory: LONG_PATH,
    notification_completion_sound_name: "Glass",
  },
  fixtures: {
    "plugin:coach|get_settings": COACH_SETTINGS,
    "plugin:coach|find_claude_connectors": CONNECTORS,
    "plugin:coach|mcp_statuses": [
      {
        name: "northwind-internal-knowledge-base-production-eu-west-1",
        state: "needs_secret",
      },
      { name: "J", state: "ready" },
    ],
    "plugin:db|get_legacy_cleanup_status": {
      migrationReady: true,
      migrationVerified: true,
      available: true,
      alreadyCleaned: false,
      fileCount: 12_483,
      totalBytes: 1_394_811_928_576,
      sourceRoot: `${LONG_PATH}/Library/Application Support/Cue`,
      blockingReason: null,
    },
    "plugin:path|resolve_directory": LONG_PATH,
  },
});

// 12,480 notes over three years, on top of the worst case: the sidebar,
// search, folders and counts at the size a heavy user reaches.
export const huge = (): Dataset => {
  const base = worst();
  const extra: Session[] = Array.from({ length: 12_480 }, (_, index) => ({
    id: `session-huge-${index}`,
    title: `${CLIENTS[index % CLIENTS.length]} sync #${index + 1}`,
    offset: -(1 * DAY + index * 2 * HOUR),
    folder: index % 4 === 0 ? `Clients/${CLIENTS[index % CLIENTS.length]}` : "",
    people: [SELF_ID],
  }));
  return { ...base, sessions: [...base.sessions, ...extra] };
};
