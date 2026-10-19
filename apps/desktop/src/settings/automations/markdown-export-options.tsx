import { Trans, useLingui } from "@lingui/react/macro";
import { useId } from "react";

import type { MarkdownExportOptions } from "@anlg/plugin-local-api";
import { Input } from "@anlg/ui/components/ui/input";

import { hasMarkdownExportContent } from "~/automations/markdown-export";

export function MarkdownExportOptionsConfig({
  options,
  onChange,
}: {
  options: MarkdownExportOptions;
  onChange: (options: MarkdownExportOptions) => void;
}) {
  const { t } = useLingui();
  const filenameId = useId();
  const helpId = useId();

  return (
    <div className="mt-4 flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-label mb-2 font-medium">
          <Trans>Include</Trans>
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(
            [
              ["include_memo", t`Memo`],
              ["include_summary", t`Summary`],
              ["include_transcript", t`Transcript`],
              ["include_action_items", t`Collect action items`],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="text-label flex cursor-pointer items-center gap-1.5"
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={options[key]}
                onChange={(event) =>
                  onChange({ ...options, [key]: event.target.checked })
                }
              />
              {label}
            </label>
          ))}
        </div>
        {!hasMarkdownExportContent(options) && (
          <p role="alert" className="text-destructive text-label">
            <Trans>Choose at least one section to export.</Trans>
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor={filenameId} className="text-label font-medium">
          <Trans>Filename</Trans>
        </label>
        <Input
          id={filenameId}
          value={options.filename}
          placeholder="{date} {title}.md"
          aria-describedby={helpId}
          className="text-label h-8"
          onChange={(event) =>
            onChange({ ...options, filename: event.target.value })
          }
        />
        <p id={helpId} className="text-muted-foreground text-label">
          <Trans>Leave blank to use the meeting date and title.</Trans>
        </p>
        <dl className="text-muted-foreground text-label flex flex-wrap gap-x-4 gap-y-1">
          <div className="flex items-center gap-1.5">
            <dt>
              <code>{"{title}"}</code>
            </dt>
            <dd>
              <Trans>Session title</Trans>
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>
              <code>{"{date}"}</code>
            </dt>
            <dd>
              <Trans>Date</Trans>
            </dd>
          </div>
        </dl>
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-label flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            className="accent-primary"
            checked={options.include_id_suffix}
            onChange={(event) =>
              onChange({ ...options, include_id_suffix: event.target.checked })
            }
          />
          <Trans>Include meeting ID</Trans>{" "}
          <code className="text-muted-foreground">[a1b2c3d4]</code>
        </label>
      </div>
    </div>
  );
}
