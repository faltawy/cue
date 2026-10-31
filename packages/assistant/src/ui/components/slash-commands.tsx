import { cx } from "./primitives";

export type SlashCommand = {
  name: string;
  label: string;
  /** Set when the command takes text after its name, e.g. "/park <a thought>". */
  argument?: string;
  run(argument: string): Promise<boolean>;
};

export function slashQuery(
  text: string,
): { name: string; argument: string | null } | null {
  if (!text.startsWith("/") || text.includes("\n")) return null;
  const space = text.indexOf(" ");
  return space === -1
    ? { name: text.slice(1).toLowerCase(), argument: null }
    : {
        name: text.slice(1, space).toLowerCase(),
        argument: text.slice(space + 1),
      };
}

export function matchCommands(
  commands: readonly SlashCommand[],
  name: string,
): SlashCommand[] {
  const prefix = commands.filter((command) => command.name.startsWith(name));
  const loose = commands.filter(
    (command) =>
      !command.name.startsWith(name) &&
      (command.name.includes(name) ||
        command.label.toLowerCase().includes(name)),
  );
  return [...prefix, ...loose];
}

export function SlashMenu({
  id,
  commands,
  highlight,
  onHover,
  onChoose,
}: {
  id: string;
  commands: readonly SlashCommand[];
  highlight: number;
  onHover(index: number): void;
  onChoose(command: SlashCommand): void;
}) {
  return (
    <div
      className="coach-enter border-border bg-surface absolute inset-x-0 bottom-full z-10 mb-1.5 max-h-[min(320px,50dvh)] overflow-y-auto overscroll-contain rounded-lg border p-1 shadow-lg"
      onMouseDown={(event) => event.preventDefault()}
    >
      <p
        className="text-muted-foreground px-2 pt-1.5 pb-1 text-[12px] font-medium"
        aria-hidden
      >
        Meeting tools
      </p>
      <div id={id} role="listbox" aria-label="Meeting tools">
        {commands.map((command, index) => (
          <div
            key={command.name}
            id={`${id}-${command.name}`}
            role="option"
            aria-selected={index === highlight}
            onMouseEnter={() => onHover(index)}
            onClick={() => onChoose(command)}
            className={cx(
              "flex h-7 cursor-default items-center gap-2 rounded-md px-2 text-[13px]",
              index === highlight && "bg-muted",
            )}
          >
            <span dir="ltr" className="shrink-0 font-medium">
              /{command.name}
              {command.argument && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  {command.argument}
                </span>
              )}
            </span>
            <span className="text-muted-foreground ms-auto min-w-0 truncate">
              {command.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
