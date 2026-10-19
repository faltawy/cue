// Demo data: a week of meetings for one person, with people, folders,
// calendar events, a summary and a transcript. Times are relative to now so
// the sidebar groups (today, yesterday, last week) fill.
import {
  bullets,
  type Dataset,
  DAY,
  doc,
  heading,
  HOUR,
  MAIN_SESSION,
  paragraph,
  SELF_ID,
  tasks,
  today,
} from "./dataset";

export const demo = (): Dataset => ({
  people: [
    {
      id: SELF_ID,
      name: "Ahmad Falta",
      email: "ahmad@open.cx",
      title: "Engineer",
      org: "org-open",
    },
    {
      id: "human-omer",
      name: "Ömer Aydın",
      email: "omer@lumen.example",
      title: "Head of Product",
      org: "org-lumen",
    },
    {
      id: "human-sara",
      name: "Sara Lindqvist",
      email: "sara@northwind.example",
      title: "Operations lead",
      org: "org-northwind",
    },
    {
      id: "human-leila",
      name: "Leila Haddad",
      email: "leila@open.cx",
      title: "Customer success",
      org: "org-open",
    },
    {
      id: "human-mia",
      name: "Mia Chen",
      email: "mia@northwind.example",
      title: "Design engineer",
      org: "org-northwind",
    },
    {
      id: "human-yousef",
      name: "يوسف أحمد",
      email: "yousef@lumen.example",
      title: "مدير العمليات",
      org: "org-lumen",
    },
  ],
  organizations: [
    { id: "org-open", name: "OpenCX" },
    { id: "org-lumen", name: "Lumen" },
    { id: "org-northwind", name: "Northwind" },
  ],
  folders: ["Clients", "Clients/Lumen", "Hiring"],
  sessions: [
    {
      id: MAIN_SESSION,
      title: "Weekly sync with Lumen",
      offset: -2 * HOUR,
      folder: "Clients/Lumen",
      people: [SELF_ID, "human-omer", "human-yousef", "human-leila"],
      note: doc(
        paragraph("Pricing page still shows the old seat tiers."),
        bullets(
          "Bcc on outbound email is live",
          "WhatsApp sessions that stayed open: fixed on Monday",
        ),
      ),
      summary: doc(
        heading("Decisions"),
        bullets(
          "Move Lumen to the annual plan from November",
          "Keep the WhatsApp channel on the shared number until the migration",
        ),
        heading("Action items"),
        tasks(
          ["Send Ömer the Bcc setup steps", false],
          ["Share the pricing page draft with Yousef", false],
          ["Close the stale WhatsApp sessions", true],
        ),
        heading("Open questions"),
        bullets("Who signs off the new seat count on their side?"),
      ),
      transcript: [
        [SELF_ID, "Thanks for making the time. Shall we start with pricing?"],
        [
          "human-omer",
          "Yes. The pricing page still shows the old seat tiers, so the team is confused.",
        ],
        [SELF_ID, "Fair. We will move you to the annual plan from November."],
        [
          "human-yousef",
          "ممتاز، وهل نحتفظ برقم واتساب الحالي حتى ننتهي من النقل؟",
        ],
        [
          "human-leila",
          "Yes, the shared number stays until the migration is done.",
        ],
        ["human-omer", "And the Bcc on outbound email, is that live already?"],
        [SELF_ID, "It is. I will send you the setup steps today."],
      ],
    },
    {
      id: "session-pricing",
      title: "Pricing review",
      offset: -5 * HOUR,
      people: [SELF_ID, "human-leila"],
      note: doc(paragraph("Annual discount stays at two months.")),
    },
    {
      id: "session-sara",
      title: "1:1 with Sara",
      offset: -1 * DAY - 2 * HOUR,
      folder: "Clients",
      people: [SELF_ID, "human-sara"],
    },
    {
      id: "session-hiring",
      title: "Hiring loop: design engineer",
      offset: -1 * DAY - 5 * HOUR,
      folder: "Hiring",
      people: [SELF_ID, "human-mia"],
      locked: true,
    },
    {
      id: "session-arabic",
      title: "مراجعة خطة الإطلاق",
      offset: -3 * DAY,
      folder: "Clients/Lumen",
      people: [SELF_ID, "human-yousef"],
      note: doc(paragraph("نراجع خطة الإطلاق مع فريق جسر يوم الأحد.")),
    },
    {
      id: "session-northwind",
      title: "Northwind onboarding",
      offset: -6 * DAY,
      folder: "Clients",
      people: [SELF_ID, "human-sara", "human-mia"],
    },
    {
      id: "session-roadmap",
      title:
        "Roadmap planning for the next two quarters with the whole product group",
      offset: -9 * DAY,
      people: [SELF_ID, "human-leila", "human-omer"],
    },
  ],
  events: [
    {
      id: "event-design",
      title: "Design review",
      start: new Date(Date.now() + 25 * 60_000),
      minutes: 30,
    },
    {
      id: "event-standup",
      title: "Team standup",
      start: today(9, 30),
      minutes: 15,
    },
    {
      id: "event-northwind",
      title: "Northwind check-in",
      start: new Date(Date.now() + DAY),
      minutes: 45,
    },
    {
      id: "event-board",
      title: "Board prep",
      start: new Date(Date.now() + 3 * DAY),
      minutes: 60,
    },
    {
      id: "event-hiring",
      title: "Interview: Mia Chen",
      start: new Date(Date.now() - 4 * DAY),
      minutes: 60,
    },
  ],
  settings: {},
  fixtures: {
    "plugin:coach|get_settings": {
      project: null,
      model: "sonnet",
      nudges: true,
      nudge_limit_cents: 500,
      mcp_servers: [],
      claude_connectors: [
        { name: "Gmail", id: "connector-gmail", url: "", allow_changes: false },
      ],
      instructions: "Answer briefly.",
      knowledge: ["/Users/demo/Documents/Playbooks"],
      web_access: false,
    },
    "plugin:coach|find_claude_connectors": [
      { name: "Gmail", id: "connector-gmail", url: "" },
      { name: "Linear", id: "connector-linear", url: "" },
      { name: "Notion", id: "connector-notion", url: "" },
    ],
  },
});
