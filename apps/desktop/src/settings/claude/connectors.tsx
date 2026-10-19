import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import {
  type ClaudeConnector,
  commands as coachCommands,
  type FoundConnector,
} from "@anlg/plugin-coach";
import { Switch } from "@anlg/ui/components/ui/switch";

export const CLAUDE_CONNECTORS_QUERY_KEY = [
  "coach",
  "claude-connectors",
] as const;

async function findConnectors() {
  const result = await coachCommands.findClaudeConnectors();
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

function connectorRows(
  found: readonly FoundConnector[],
  saved: readonly ClaudeConnector[],
): FoundConnector[] {
  const missing = saved.filter(
    (connector) => !found.some((row) => row.id === connector.id),
  );
  return [...found, ...missing.map(({ name, id, url }) => ({ name, id, url }))];
}

export function ClaudeConnectorsGroup({
  connectors,
  disabled,
  onChange,
}: {
  connectors: ClaudeConnector[];
  disabled: boolean;
  onChange: (connectors: ClaudeConnector[]) => Promise<unknown>;
}) {
  const { t } = useLingui();
  const found = useQuery({
    queryKey: CLAUDE_CONNECTORS_QUERY_KEY,
    queryFn: findConnectors,
    staleTime: Infinity,
  });
  const rows = connectorRows(found.data ?? [], connectors);

  const turn = (row: FoundConnector, on: boolean) =>
    onChange(
      on
        ? [...connectors, { ...row, allow_changes: false }]
        : connectors.filter((connector) => connector.id !== row.id),
    );

  const allowChanges = (id: string, allow_changes: boolean) =>
    onChange(
      connectors.map((connector) =>
        connector.id === id ? { ...connector, allow_changes } : connector,
      ),
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-ui font-medium">
          <Trans>Claude connectors</Trans>
        </h3>
        <p className="text-muted-foreground text-label">
          <Trans>
            Connectors on your Claude account. The coach only uses the ones you
            turn on, and only reads unless you allow changes.
          </Trans>
        </p>
      </div>

      {found.isPending && (
        <p className="text-muted-foreground text-label">
          <Trans>Looking for connectors on your Claude account…</Trans>
        </p>
      )}
      {found.error && (
        <p role="alert" className="text-destructive text-label">
          {found.error.message}
        </p>
      )}
      {found.isSuccess && rows.length === 0 && (
        <p className="text-muted-foreground text-label">
          <Trans>
            No connectors found. Add them in Claude under Settings → Connectors.
          </Trans>
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const saved = connectors.find(
              (connector) => connector.id === row.id,
            );
            const isGmail = /^Gmail( \(\d+\))?$/.test(row.name);
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-ui font-medium [overflow-wrap:anywhere]">
                    {row.name}
                  </div>
                  {isGmail && (
                    <p className="text-muted-foreground text-label">
                      <Trans>
                        Searches and reads mail. With changes allowed it can
                        write drafts. It never sends, deletes or labels mail.
                      </Trans>
                    </p>
                  )}
                </div>
                <label className="text-muted-foreground text-label flex shrink-0 items-center gap-2 whitespace-nowrap">
                  <Trans>On</Trans>
                  <Switch
                    aria-label={t`Use ${row.name}`}
                    checked={saved !== undefined}
                    disabled={disabled}
                    onCheckedChange={(on) => turn(row, on)}
                  />
                </label>
                <label className="text-muted-foreground text-label flex shrink-0 items-center gap-2 whitespace-nowrap">
                  <Trans>Allow changes</Trans>
                  <Switch
                    aria-label={t`Allow ${row.name} to make changes`}
                    checked={saved?.allow_changes ?? false}
                    disabled={disabled || saved === undefined}
                    onCheckedChange={(allow) => allowChanges(row.id, allow)}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
