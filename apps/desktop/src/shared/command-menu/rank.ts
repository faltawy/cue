import { defaultFilter } from "cmdk";

export type CommandGroupId = "actions" | "notes" | "people" | "pages";

export type RankableCommand = {
  id: string;
  group: CommandGroupId;
  label: string;
  keywords?: readonly string[];
  boost?: number;
};

export type RankedGroup<T extends RankableCommand> = {
  id: CommandGroupId;
  items: T[];
};

const GROUP_ORDER: readonly CommandGroupId[] = [
  "actions",
  "notes",
  "people",
  "pages",
];

const GROUP_LIMITS: Record<CommandGroupId, number> = {
  actions: 5,
  notes: 8,
  people: 5,
  pages: 6,
};

export function scoreCommand(command: RankableCommand, query: string) {
  const score = defaultFilter(
    command.label,
    query,
    command.keywords ? [...command.keywords] : undefined,
  );
  return score * (1 + (command.boost ?? 0));
}

export function rankCommands<T extends RankableCommand>(
  commands: readonly T[],
  query: string,
): RankedGroup<T>[] {
  const trimmed = query.trim();
  const byGroup = new Map<CommandGroupId, { command: T; score: number }[]>();

  commands.forEach((command) => {
    const score = scoreCommand(command, trimmed);
    if (score <= 0) return;
    const bucket = byGroup.get(command.group) ?? [];
    bucket.push({ command, score });
    byGroup.set(command.group, bucket);
  });

  return GROUP_ORDER.flatMap((id) => {
    const bucket = byGroup.get(id);
    if (!bucket) return [];
    const sorted = bucket
      .map((entry, index) => ({ ...entry, index }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    return [
      {
        id,
        top: sorted[0].score,
        items: sorted.slice(0, GROUP_LIMITS[id]).map((entry) => entry.command),
      },
    ];
  })
    .sort(
      (a, b) =>
        b.top - a.top || GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id),
    )
    .map(({ id, items }) => ({ id, items }));
}
