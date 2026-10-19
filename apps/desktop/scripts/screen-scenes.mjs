// Scenes for screen-shots.mjs, after the screenshot plan in
// docs/design/cue-audit.md §7. Each scene starts on the main window with a
// seeded workspace (plugins/dev-screens, `--data` picks the dataset) and runs
// its steps:
//   { click | hover | find: "accessible name" | { text, selector, nth } }
//   { key: "k", mods: ["meta"] }, { type: "text" }, { eval: "js" }
//   `wait` (ms) after any step; `sql` runs before the page loads.

// What each dataset names the things scenes click (plugins/dev-screens).
const ANCHORS = {
  demo: {
    note: "Weekly sync with Lumen",
    hover: "Pricing review",
    speaker: "Ömer Aydın",
    person: "Ömer Aydın",
    organization: "Lumen",
    template: "Daily Standup",
    folder: "Clients",
    locked: "Hiring loop",
  },
  worst: {
    note: "Weekly sync with Lumen",
    hover: "Pairing with Priya",
    speaker: "Christopher Alexander Montgomery III",
    person: "Konstantin Oberhauser-Wettstein",
    organization: "Northwind Industries Holdings International GmbH & Co. KG",
    template: "Enterprise quarterly business review",
    folder: "Clients",
    locked: "Hiring loop",
  },
  one: {
    note: "Weekly sync with Lumen",
    hover: "Weekly sync with Lumen",
    speaker: "Ömer Aydın",
    person: "Ömer Aydın",
    organization: "Lumen",
    template: "One template",
    folder: "Clients",
  },
  empty: { template: "Daily Standup" },
};
ANCHORS.huge = ANCHORS.worst;

const selectWords = (needle, from, to) => ({
  eval: `(() => {
    const section = [...document.querySelectorAll("section")].find((s) => s.innerText.includes(${JSON.stringify(needle)}));
    const spans = [...section.querySelectorAll("span")].filter((s) => !s.childElementCount && s.textContent.trim());
    const start = spans.find((s) => s.textContent.includes(${JSON.stringify(from)}));
    const end = spans.find((s) => s.textContent.includes(${JSON.stringify(to)}));
    const range = document.createRange();
    range.setStart(start.firstChild, 0);
    range.setEnd(end.firstChild, end.textContent.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    const box = end.getBoundingClientRect();
    section.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: box.right, clientY: box.bottom }));
  })()`,
  wait: 800,
});

const scrollTo = (heading) => ({
  eval: `[...document.querySelectorAll("h2, h3")].find((h) => h.textContent.trim() === ${JSON.stringify(heading)})?.scrollIntoView({ block: "start" })`,
  wait: 600,
});

const recording = (sessionId) => ({
  eval: `import("/src/store/zustand/listener/instance.ts").then(({ listenerStore }) => listenerStore.setState((s) => ({ live: { ...s.live, sessionId: ${JSON.stringify(sessionId)}, status: "active", seconds: 45296, amplitude: { mic: 0.6, speaker: 0.4 } } })))`,
  wait: 800,
});

export function scenes(data = "demo") {
  const a = ANCHORS[data] ?? ANCHORS.demo;
  const openNote = {
    click: { text: a.note, selector: "button", contains: true },
    wait: 1200,
  };
  const settings = (section) => [
    { click: { text: "Settings", selector: "button" }, wait: 900 },
    ...(section
      ? [{ click: { text: section, selector: "button, a" }, wait: 700 }]
      : []),
  ];
  const transcript = [openNote, { click: "Transcript", wait: 900 }];

  const all = [
    {
      name: "01-timeline",
      needs: "hover",
      steps: [{ hover: { text: a.hover, selector: "button", contains: true } }],
    },
    {
      name: "01-timeline-recording",
      needs: "note",
      steps: [recording("session-lumen-weekly")],
    },
    { name: "02-note", needs: "note", steps: [openNote] },
    {
      name: "03-overflow-menu",
      needs: "note",
      steps: [openNote, { click: "More" }],
    },
    {
      name: "03-export-dialog",
      needs: "note",
      steps: [openNote, { click: "More" }, { click: "Export", wait: 600 }],
    },
    {
      name: "04-meeting-info",
      needs: "note",
      steps: [
        openNote,
        { click: "More" },
        { click: "Meeting info", wait: 600 },
      ],
    },
    { name: "05-transcript", needs: "note", steps: transcript },
    {
      name: "05-transcript-scrolled",
      needs: "note",
      steps: [
        ...transcript,
        {
          eval: `[...document.querySelectorAll("section[data-transcript-segment-id]")].at(-1)?.scrollIntoView({ block: "end" })`,
          wait: 900,
        },
      ],
    },
    {
      name: "05-speaker-assign",
      needs: "speaker",
      steps: [
        ...transcript,
        {
          activate: {
            text: a.speaker,
            selector: "button[data-transcript-speaker-assign]",
          },
          wait: 700,
        },
      ],
    },
    {
      name: "05-selection-menu",
      needs: "note",
      steps: [
        ...transcript,
        data === "demo"
          ? selectWords("pricing page still", "pricing", "tiers")
          : selectWords("Sorry, joining late", "joining", "room,"),
      ],
    },
    {
      name: "06-template-picker",
      needs: "note",
      steps: [
        openNote,
        { click: { text: "Summary", selector: "button" }, wait: 700 },
      ],
    },
    {
      name: "07-note-search",
      needs: "note",
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
      steps: [...settings(), scrollTo("Storage")],
    },
    { name: "11-settings-appearance", steps: settings("Appearance") },
    { name: "12-settings-transcription", steps: settings("Transcription") },
    { name: "13-settings-dictionary", steps: settings("Dictionary") },
    { name: "13-settings-automations", steps: settings("Automations") },
    { name: "13-settings-claude", steps: settings("Claude") },
    {
      name: "13-settings-claude-connectors",
      steps: [...settings("Claude"), scrollTo("Claude connectors")],
    },
    { name: "13-settings-permissions", steps: settings("Permissions") },
    { name: "14-contacts", steps: settings("Contacts") },
    {
      name: "14-contacts-person",
      needs: "person",
      steps: [
        ...settings("Contacts"),
        { click: { text: a.person, exact: true }, wait: 800 },
      ],
    },
    {
      name: "14-contacts-organization",
      needs: "organization",
      steps: [
        ...settings("Contacts"),
        { click: { text: a.organization, exact: true }, wait: 800 },
      ],
    },
    { name: "15-calendar", steps: [{ click: "Open calendar", wait: 1200 }] },
    {
      name: "16-templates",
      needs: "template",
      steps: [
        ...settings("Templates"),
        {
          click: { text: a.template, contains: true, selector: "button, a" },
          wait: 800,
        },
      ],
    },
    {
      name: "17-folders",
      needs: "folder",
      steps: [
        ...settings("Folders"),
        {
          click: { text: a.folder, selector: "button", contains: true },
          wait: 800,
        },
      ],
    },
    { name: "17-folders-empty", steps: settings("Folders") },
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
      needs: "note",
      steps: [
        openNote,
        { click: "More" },
        { click: "Version history", wait: 700 },
      ],
    },
    {
      name: "22-locked-note",
      needs: "locked",
      url: "/app/main?unlock",
      steps: [
        {
          click: { text: a.locked, selector: "button", contains: true },
          wait: 1200,
        },
        {
          eval: `import("/src/lock/store.ts").then(({ useAppLock }) => useAppLock.getState().concealNote("session-hiring"))`,
          wait: 800,
        },
      ],
    },
  ];
  return all
    .filter((scene) => !scene.needs || a[scene.needs])
    .map((scene) => ({ ready: a.note ?? "Open calendar", ...scene }));
}
