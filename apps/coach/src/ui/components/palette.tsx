import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { cx, Kbd } from "./primitives";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  shortcut?: string[];
  run(): void;
};

export function scoreCommand(label: string, query: string): number {
  const text = label.toLowerCase();
  const needle = query.trim().toLowerCase();
  if (!needle) return 1;
  if (text.startsWith(needle)) return 3;
  const words = text.split(/\s+/);
  if (words.some((word) => word.startsWith(needle))) return 2;
  const initials = words.map((word) => word[0] ?? "").join("");
  let position = 0;
  for (const char of needle) {
    position = initials.indexOf(char, position);
    if (position === -1) return 0;
    position += 1;
  }
  return 1;
}

export function filterCommands(commands: readonly Command[], query: string): Command[] {
  return commands
    .map((command, index) => ({ command, index, score: scoreCommand(command.label, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

export function Palette({ commands, onClose }: { commands: Command[]; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    input.current?.focus();
  }, []);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 px-3 pt-14 dark:bg-black/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Actions"
        className="coach-enter w-full max-w-[420px] overflow-hidden rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => (results.length === 0 ? 0 : (value + 1) % results.length));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => (results.length === 0 ? 0 : (value - 1 + results.length) % results.length));
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(results[current]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }
            }}
            placeholder="Type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[current] ? `${listId}-${results[current].id}` : undefined}
            className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
          />
          <Kbd keys={["esc"]} />
        </div>
        <ul id={listId} role="listbox" aria-label="Commands" className="coach-scroll max-h-[320px] overflow-y-auto p-1">
          {results.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matching action.</li>}
          {results.map((command, index) => (
            <li
              key={command.id}
              id={`${listId}-${command.id}`}
              role="option"
              aria-selected={index === current}
              onMouseMove={() => setActive(index)}
              onClick={() => run(command)}
              className={cx(
                "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[13px]",
                index === current && "bg-muted",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{command.label}</span>
                {command.hint && <span className="block truncate text-[11.5px] text-muted-foreground">{command.hint}</span>}
              </span>
              {command.shortcut && <Kbd keys={command.shortcut} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
