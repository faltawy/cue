// Scenes for screen-shots.mjs, after the screenshot plan in
// docs/design/cue-audit.md §7. Each scene starts on the main window with the
// seeded workspace (plugins/dev-screens/seed.ts) and runs its steps:
//   { click | hover | find: "accessible name" | { text, selector, nth } }
//   { key: "k", mods: ["meta"] }, { type: "text" }, { eval: "js" }
//   `wait` (ms) after any step; `sql` runs before the page loads.
const NOTE = "Weekly sync with Lumen";
const openNote = {
  click: { text: NOTE, selector: "button", contains: true },
  wait: 1200,
};
const settings = (section) => [
  { click: { text: "Settings", selector: "button" }, wait: 900 },
  ...(section
    ? [{ click: { text: section, selector: "button, a" }, wait: 700 }]
    : []),
];

const selectWords = {
  eval: `(() => {
    const section = [...document.querySelectorAll("section")].find((s) => s.innerText.includes("pricing page still"));
    const spans = [...section.querySelectorAll("span")].filter((s) => !s.childElementCount && s.textContent.trim());
    const from = spans.find((s) => s.textContent.includes("pricing"));
    const to = spans.find((s) => s.textContent.includes("tiers"));
    const range = document.createRange();
    range.setStart(from.firstChild, 0);
    range.setEnd(to.firstChild, to.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const box = to.getBoundingClientRect();
    section.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: box.right, clientY: box.bottom }));
  })()`,
  wait: 800,
};

export const SCENES = [
  {
    name: "01-timeline",
    steps: [{ hover: { text: "Pricing review", selector: "button" } }],
  },
  { name: "02-note", steps: [openNote] },
  { name: "03-overflow-menu", steps: [openNote, { click: "More" }] },
  {
    name: "03-export-dialog",
    steps: [openNote, { click: "More" }, { click: "Export", wait: 600 }],
  },
  {
    name: "04-meeting-info",
    steps: [openNote, { click: "More" }, { click: "Meeting info", wait: 600 }],
  },
  {
    name: "05-transcript",
    steps: [openNote, { click: "Transcript", wait: 900 }],
  },
  {
    name: "05-speaker-assign",
    steps: [
      openNote,
      { click: "Transcript", wait: 900 },
      {
        activate: {
          text: "Ömer Aydın",
          selector: "button[data-transcript-speaker-assign]",
        },
        wait: 700,
      },
    ],
  },
  {
    name: "05-selection-menu",
    steps: [openNote, { click: "Transcript", wait: 900 }, selectWords],
  },
  {
    name: "06-template-picker",
    steps: [
      openNote,
      { click: { text: "Summary", selector: "button" }, wait: 700 },
    ],
  },
  {
    name: "07-note-search",
    steps: [
      openNote,
      { key: "f", mods: ["meta"] },
      { type: "seat", wait: 600 },
    ],
  },
  { name: "08-quick-open", steps: [{ key: "k", mods: ["meta"], wait: 700 }] },
  { name: "09-settings-general", steps: settings() },
  { name: "09-settings-notifications", steps: settings("Notifications") },
  { name: "09-settings-meetings", steps: settings("Meetings") },
  {
    name: "10-settings-storage",
    steps: [
      ...settings(),
      {
        eval: `[...document.querySelectorAll("h2, h3")].find((h) => h.textContent.trim() === "Storage")?.scrollIntoView({ block: "start" })`,
        wait: 600,
      },
    ],
  },
  { name: "11-settings-appearance", steps: settings("Appearance") },
  { name: "12-settings-transcription", steps: settings("Transcription") },
  { name: "13-settings-dictionary", steps: settings("Dictionary") },
  { name: "13-settings-automations", steps: settings("Automations") },
  { name: "13-settings-claude", steps: settings("Claude") },
  { name: "13-settings-permissions", steps: settings("Permissions") },
  {
    name: "14-contacts-person",
    steps: [
      ...settings("Contacts"),
      { click: { text: "Ömer Aydın", exact: true }, wait: 800 },
    ],
  },
  {
    name: "14-contacts-organization",
    steps: [
      ...settings("Contacts"),
      { click: { text: "Lumen", exact: true }, wait: 800 },
    ],
  },
  { name: "15-calendar", steps: [{ click: "Open calendar", wait: 1200 }] },
  {
    name: "16-templates",
    steps: [
      ...settings("Templates"),
      { click: { text: "Daily Standup", exact: true }, wait: 800 },
    ],
  },
  {
    name: "17-folders",
    steps: [
      ...settings("Folders"),
      { click: { text: "Lumen", exact: true }, wait: 800 },
    ],
  },
  { name: "17-calendar-settings", steps: settings("Calendar") },
  { name: "18-toast", keepToasts: true, steps: [] },
  {
    name: "19-onboarding",
    url: "/app/onboarding?onboarding",
    ready: "",
    steps: [],
    settle: 1500,
  },
  {
    name: "21-devtools",
    url: "/app/main?devtools",
    steps: [
      {
        eval: `localStorage.setItem("anarlog:devtools-bar:collapsed", "0"); location.reload()`,
        wait: 3000,
      },
    ],
  },
  {
    name: "22-version-history",
    steps: [
      openNote,
      { click: "More" },
      { click: "Version history", wait: 700 },
    ],
  },
  {
    name: "22-locked-note",
    url: "/app/main?unlock",
    steps: [
      {
        click: { text: "Hiring loop", selector: "button", contains: true },
        wait: 1200,
      },
      {
        eval: `import("/src/lock/store.ts").then(({ useAppLock }) => useAppLock.getState().concealNote("session-hiring"))`,
        wait: 800,
      },
    ],
  },
];
