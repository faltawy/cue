import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useState } from "react";

import { Button } from "@anlg/ui/components/ui/button";
import { Textarea } from "@anlg/ui/components/ui/textarea";

const INSTRUCTIONS_SOFT_LIMIT = 4000;
const AUTOSAVE_MS = 800;

export function CoachInstructionsSection({
  instructions,
  knowledge,
  onSaveInstructions,
  onRemoveKnowledge,
  onAddKnowledge,
  busy,
}: {
  instructions: string;
  knowledge: string[];
  onSaveInstructions: (instructions: string) => void;
  onRemoveKnowledge: (path: string) => void;
  onAddKnowledge: (folder: boolean) => void;
  busy: boolean;
}) {
  const { t } = useLingui();
  const [draft, setDraft] = useState(instructions);

  useEffect(() => {
    if (draft === instructions) return;
    const timer = setTimeout(() => onSaveInstructions(draft), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [draft, instructions, onSaveInstructions]);

  const tooLong = draft.length > INSTRUCTIONS_SOFT_LIMIT;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title">
          <Trans>Coach instructions</Trans>
        </h2>
        <p className="text-muted-foreground text-label">
          <Trans>
            What the coach should know about you and how to answer. Markdown is
            fine. Changes apply from the coach's next chat.
          </Trans>
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Textarea
          aria-label={t`Coach instructions`}
          placeholder={t`e.g. I'm the CTO of Northwind. Prefer short answers. Never promise dates.`}
          className="min-h-[120px] font-mono text-label"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== instructions) onSaveInstructions(draft);
          }}
        />
        <div className="flex justify-between gap-4 text-label">
          {tooLong && (
            <span className="text-destructive">
              <Trans>
                These are sent with every message, so long instructions use
                more of your Claude plan.
              </Trans>
            </span>
          )}
          <span
            className={
              tooLong ? "text-destructive" : "text-muted-foreground ms-auto"
            }
          >
            {draft.length.toLocaleString()} /{" "}
            {INSTRUCTIONS_SOFT_LIMIT.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-ui font-medium">
          <Trans>Knowledge</Trans>
        </h3>
        <p className="text-muted-foreground text-label">
          <Trans>
            Files and folders the coach can read when they're relevant. They
            are read on demand, not sent with every message.
          </Trans>
        </p>
        {knowledge.length > 0 && (
          <ul className="flex flex-col gap-1">
            {knowledge.map((path) => (
              <li
                key={path}
                className="flex items-center justify-between gap-4"
              >
                <span className="truncate text-label">{path}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={t`Remove ${path}`}
                  disabled={busy}
                  onClick={() => onRemoveKnowledge(path)}
                >
                  <Trans>Remove</Trans>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAddKnowledge(true)}
          >
            <Trans>Add folder…</Trans>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onAddKnowledge(false)}
          >
            <Trans>Add file…</Trans>
          </Button>
        </div>
      </div>
    </section>
  );
}
