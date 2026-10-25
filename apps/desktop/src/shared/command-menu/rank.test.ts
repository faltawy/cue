import { describe, expect, it } from "vitest";

import { rankCommands, type RankableCommand } from "./rank";

import { CommandGroupId } from "~/shared/enums";

const note = (id: string, label: string, boost?: number): RankableCommand => ({
  id,
  group: CommandGroupId.Notes,
  label,
  boost,
});

describe("rankCommands", () => {
  it("orders a prefix match above a word-start match above a substring match", () => {
    const groups = rankCommands(
      [
        note("substring", "Async planning"),
        note("word-start", "Weekly sync"),
        note("prefix", "Sync with Sara"),
        note("miss", "Design review"),
      ],
      "sync",
    );

    expect(groups).toEqual([
      {
        id: "notes",
        items: [
          note("prefix", "Sync with Sara"),
          note("word-start", "Weekly sync"),
          note("substring", "Async planning"),
        ],
      },
    ]);
  });

  it("matches keywords as well as the label", () => {
    const groups = rankCommands(
      [
        {
          id: "sara",
          group: CommandGroupId.People,
          label: "Sara Ahmed",
          keywords: ["sara@northwind.com", "Northwind"],
        },
        { id: "omar", group: CommandGroupId.People, label: "Omar Ali" },
      ],
      "northwind.com",
    );

    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["sara"],
    ]);
  });

  it("puts the group with the strongest match first", () => {
    const groups = rankCommands(
      [
        note("weekly", "Weekly settings review"),
        { id: "settings", group: CommandGroupId.Pages, label: "Settings" },
      ],
      "settings",
    );

    expect(groups.map((group) => group.id)).toEqual(["pages", "notes"]);
  });

  it("lets a boost lift a recent note above an equally matching one", () => {
    const groups = rankCommands(
      [note("older", "Sync with Sara"), note("recent", "Sync with Sara", 0.1)],
      "sync",
    );

    expect(groups[0].items.map((item) => item.id)).toEqual(["recent", "older"]);
  });

  it("caps each group so one kind cannot flood the menu", () => {
    const notes = Array.from({ length: 20 }, (_, index) =>
      note(`n${index}`, `Standup ${index}`),
    );

    const groups = rankCommands(notes, "standup");

    expect(groups[0].items).toHaveLength(8);
    expect(groups[0].items[0].id).toBe("n0");
  });
});
