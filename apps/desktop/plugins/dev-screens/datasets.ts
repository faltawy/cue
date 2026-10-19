import {
  type Dataset,
  type DatasetName,
  doc,
  HOUR,
  MAIN_SESSION,
  paragraph,
  SELF_ID,
} from "./dataset";
import { demo } from "./demo";
import { huge, worst } from "./worst";

// A new user: only themselves, no notes, events, folders or contacts.
const empty = (): Dataset => {
  const base = demo();
  return {
    people: base.people.filter((person) => person.id === SELF_ID),
    organizations: base.organizations.filter((org) => org.id === "org-open"),
    folders: [],
    sessions: [],
    events: [],
    settings: {},
  };
};

// Exactly one of everything, for "1 notes" and "1 of 1".
const one = (): Dataset => {
  const base = demo();
  return {
    people: base.people.filter((person) =>
      [SELF_ID, "human-omer"].includes(person.id),
    ),
    organizations: base.organizations.filter((org) =>
      ["org-open", "org-lumen"].includes(org.id),
    ),
    folders: ["Clients"],
    sessions: [
      {
        id: MAIN_SESSION,
        title: "Weekly sync with Lumen",
        offset: -2 * HOUR,
        folder: "Clients",
        people: [SELF_ID, "human-omer"],
        tags: ["pricing"],
        note: doc(paragraph("One note.")),
        transcript: [["human-omer", "One line."]],
      },
    ],
    events: base.events.slice(0, 1),
    templates: [
      {
        id: "template-one",
        title: "One template",
        description: "",
        sections: [{ title: "One section", description: "" }],
      },
    ],
    settings: {
      sidebar_show_tags: true,
      personalization_dictionary_terms: JSON.stringify(["OpenCX"]),
    },
    fixtures: {
      "plugin:db|get_legacy_cleanup_status": {
        migrationReady: true,
        migrationVerified: true,
        available: true,
        alreadyCleaned: false,
        fileCount: 1,
        totalBytes: 1,
        sourceRoot: "/Users/demo/Library/Application Support/com.anarlog.app",
        blockingReason: null,
      },
    },
  };
};

export const DATASET_BUILDERS: Record<DatasetName, () => Dataset> = {
  demo,
  worst,
  empty,
  one,
  huge,
};
