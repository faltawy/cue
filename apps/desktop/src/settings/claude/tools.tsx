import { Trans, useLingui } from "@lingui/react/macro";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import {
  commands as coachCommands,
  type McpAuth,
  type McpAuthState,
  type McpProbe,
  type McpSecretInput,
  type McpServer,
} from "@anlg/plugin-coach";
import { Badge } from "@anlg/ui/components/ui/badge";
import { Button } from "@anlg/ui/components/ui/button";
import { Input } from "@anlg/ui/components/ui/input";
import { Switch } from "@anlg/ui/components/ui/switch";

import { ServerProblem } from "~/settings/enums";

const RESERVED_NAME = "meeting";
const NAME_PATTERN = /^[a-z0-9_-]+$/;
const HEADER_PATTERN = /^[A-Za-z0-9_-]+$/;
const HOST_NOISE = new Set(["mcp", "www", "api", "localhost"]);
export const MCP_STATUSES_QUERY_KEY = ["coach", "mcp-statuses"] as const;

type Found = Exclude<McpProbe, { kind: "unreachable" } | { kind: "not_mcp" }>;

type Draft = {
  name: string;
  token: string;
  username: string;
  password: string;
  headerName: string;
  useHeader: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  token: "",
  username: "",
  password: "",
  headerName: "",
  useHeader: false,
};

export { ServerProblem };

function unwrap<T>(
  result: { status: "ok"; data: T } | { status: "error"; error: string },
): T {
  if (result.status === "error") throw new Error(result.error);
  return result.data;
}

export function parseServerUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function suggestName(found: Found, url: URL): string {
  const fromServer = found.kind === "none" ? (found.server_name ?? "") : "";
  const labels = url.hostname
    .split(".")
    .slice(0, -1)
    .filter((label) => !HOST_NOISE.has(label) && !/^\d+$/.test(label));
  return (fromServer || labels[0] || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/^-+|-+$/g, "");
}

function authFor(found: Found, draft: Draft): McpAuth {
  if (draft.useHeader) return { kind: "header", name: draft.headerName.trim() };
  switch (found.kind) {
    case "none":
      return { kind: "none" };
    case "basic":
      return { kind: "basic", username: draft.username.trim() };
    case "bearer":
      return { kind: "bearer" };
  }
}

function secretFor(auth: McpAuth, draft: Draft): McpSecretInput | null {
  switch (auth.kind) {
    case "bearer":
      return { kind: "token", token: draft.token };
    case "header":
      return { kind: "header", value: draft.token };
    case "basic":
      return { kind: "basic", password: draft.password };
    default:
      return null;
  }
}

export function findServerProblem(
  name: string,
  auth: McpAuth,
  secret: McpSecretInput | null,
  existing: readonly McpServer[],
): ServerProblem | null {
  if (!NAME_PATTERN.test(name) || name.includes("__"))
    return ServerProblem.Name;
  if (name === RESERVED_NAME) return ServerProblem.Reserved;
  if (existing.some((server) => server.name === name))
    return ServerProblem.Duplicate;
  if (auth.kind === "header" && !HEADER_PATTERN.test(auth.name)) {
    return ServerProblem.Header;
  }
  if (
    auth.kind === "basic" &&
    (!auth.username || auth.username.includes(":"))
  ) {
    return ServerProblem.Username;
  }
  if (secret && !secretValue(secret)) return ServerProblem.Secret;
  return null;
}

function secretValue(secret: McpSecretInput) {
  switch (secret.kind) {
    case "token":
      return secret.token;
    case "basic":
      return secret.password;
    case "header":
      return secret.value;
  }
}

export function CoachToolsSection({
  servers,
  disabled,
  onChange,
}: {
  servers: McpServer[];
  disabled: boolean;
  onChange: (servers: McpServer[]) => Promise<unknown>;
}) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const statuses = useQuery({
    queryKey: [...MCP_STATUSES_QUERY_KEY, servers],
    queryFn: async () => unwrap(await coachCommands.mcpStatuses()),
  });
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<{ probe: Found; url: URL } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const problemMessages: Record<ServerProblem, string> = {
    name: t`Use lowercase letters, digits, - or _ for the name.`,
    reserved: t`"meeting" is reserved for the coach's own tools.`,
    duplicate: t`A tool with this name already exists.`,
    url: t`Enter an http or https address.`,
    header: t`Header names use letters, digits, - or _.`,
    username: t`Enter a user name without ":".`,
    secret: t`Enter the secret this server needs.`,
  };

  const refreshStatuses = () =>
    queryClient.invalidateQueries({ queryKey: MCP_STATUSES_QUERY_KEY });

  const run = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy(null);
      await refreshStatuses();
    }
  };

  const check = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseServerUrl(url);
    if (!parsed) {
      setMessage(problemMessages.url);
      return;
    }
    setChecking(true);
    setMessage(null);
    try {
      const probe = unwrap(await coachCommands.probeMcpServer(parsed.href));
      if (probe.kind === "unreachable") {
        setMessage(t`Couldn't reach it: ${probe.reason}`);
      } else if (probe.kind === "not_mcp") {
        setMessage(probe.message);
      } else {
        setFound({ probe, url: parsed });
        setDraft({ ...EMPTY_DRAFT, name: suggestName(probe, parsed) });
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setChecking(false);
    }
  };

  const reset = () => {
    setFound(null);
    setDraft(EMPTY_DRAFT);
    setUrl("");
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    if (!found) return;
    const name = draft.name.trim();
    const auth = authFor(found.probe, draft);
    const secret = secretFor(auth, draft);
    const problem = findServerProblem(name, auth, secret, servers);
    if (problem) {
      setMessage(problemMessages[problem]);
      return;
    }
    const server: McpServer = {
      name,
      url: found.url.href,
      auth,
      allow_changes: false,
      enabled: true,
    };
    const added = await run(name, async () => {
      await onChange([...servers, server]);
      if (secret) unwrap(await coachCommands.setMcpSecret(name, secret));
    });
    if (added) reset();
  };

  const update = (index: number, patch: Partial<McpServer>) =>
    run(servers[index].name, () =>
      onChange(
        servers.map((server, i) =>
          i === index ? { ...server, ...patch } : server,
        ),
      ),
    );

  const field =
    (key: "name" | "token" | "username" | "password" | "headerName") =>
    (event: { target: { value: string } }) =>
      setDraft({ ...draft, [key]: event.target.value });

  const stateOf = (name: string): McpAuthState | undefined =>
    statuses.data?.find((status) => status.name === name)?.state;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-title">
          <Trans>Tools</Trans>
        </h2>
        <p className="text-muted-foreground text-label">
          <Trans>
            MCP servers the coach can use in every meeting. Their tools only
            read unless you allow changes. Secrets stay in your Keychain.
          </Trans>
        </p>
      </div>

      {servers.length > 0 && (
        <ul className="flex flex-col gap-3">
          {servers.map((server, index) => (
            <ServerRow
              key={server.name}
              server={server}
              state={stateOf(server.name)}
              disabled={disabled || busy !== null}
              onUpdate={(patch) => update(index, patch)}
              onRemove={() =>
                run(server.name, () =>
                  onChange(servers.filter((_, i) => i !== index)),
                )
              }
              onSecret={(secret) =>
                run(server.name, async () =>
                  unwrap(await coachCommands.setMcpSecret(server.name, secret)),
                )
              }
            />
          ))}
        </ul>
      )}

      {found ? (
        <form className="flex flex-col gap-2" onSubmit={add}>
          <p className="text-label">
            <span className="text-muted-foreground">{found.url.href}</span>
            {" · "}
            <FoundSummary probe={found.probe} />
          </p>
          <Input
            aria-label={t`Tool name`}
            placeholder={t`Name, e.g. clients`}
            value={draft.name}
            onChange={field("name")}
          />
          {found.probe.kind === "basic" && !draft.useHeader && (
            <div className="grid grid-cols-2 gap-2">
              <Input
                aria-label={t`User name`}
                placeholder={t`User name`}
                value={draft.username}
                onChange={field("username")}
              />
              <Input
                aria-label={t`Password`}
                type="password"
                placeholder={t`Password`}
                value={draft.password}
                onChange={field("password")}
              />
            </div>
          )}
          {draft.useHeader && (
            <Input
              aria-label={t`Header name`}
              placeholder={t`Header, e.g. X-API-Key`}
              value={draft.headerName}
              onChange={field("headerName")}
            />
          )}
          {(draft.useHeader || found.probe.kind === "bearer") && (
            <Input
              aria-label={draft.useHeader ? t`Header value` : t`Access token`}
              type="password"
              placeholder={draft.useHeader ? t`Header value` : t`Access token`}
              value={draft.token}
              onChange={field("token")}
            />
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <Trans>Back</Trans>
              </Button>
              {found.probe.kind !== "none" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setDraft({ ...draft, useHeader: !draft.useHeader })
                  }
                >
                  {draft.useHeader ? (
                    <Trans>Use the detected sign-in</Trans>
                  ) : (
                    <Trans>Use a custom header instead</Trans>
                  )}
                </Button>
              )}
            </div>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={disabled || busy !== null}
            >
              <Trans>Add server</Trans>
            </Button>
          </div>
        </form>
      ) : (
        <form className="flex gap-2" onSubmit={check}>
          <Input
            aria-label={t`Tool address`}
            placeholder="http://127.0.0.1:7777/mcp"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={checking || url.trim() === ""}
          >
            {checking ? <Trans>Checking…</Trans> : <Trans>Check</Trans>}
          </Button>
        </form>
      )}

      {message && (
        <p role="alert" className="text-destructive text-label">
          {message}
        </p>
      )}
    </section>
  );
}

function FoundSummary({ probe }: { probe: Found }) {
  switch (probe.kind) {
    case "none":
      return probe.server_name ? (
        <Trans>Found {probe.server_name}. No sign-in needed.</Trans>
      ) : (
        <Trans>No sign-in needed.</Trans>
      );
    case "bearer":
      return probe.browser_sign_in ? (
        <Trans>
          Needs an access token. This server usually signs in through a browser;
          paste an API key or personal token from its settings.
        </Trans>
      ) : (
        <Trans>Needs an access token.</Trans>
      );
    case "basic":
      return <Trans>Needs a user name and password.</Trans>;
  }
}

function ServerRow({
  server,
  state,
  disabled,
  onUpdate,
  onRemove,
  onSecret,
}: {
  server: McpServer;
  state: McpAuthState | undefined;
  disabled: boolean;
  onUpdate: (patch: Partial<McpServer>) => void;
  onRemove: () => void;
  onSecret: (secret: McpSecretInput) => Promise<boolean>;
}) {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const auth = server.auth ?? { kind: "none" };

  const authLabels: Record<McpAuth["kind"], string> = {
    none: t`No sign-in`,
    bearer: t`Token`,
    basic: t`Password`,
    header: auth.kind === "header" ? t`${auth.name} header` : "",
  };
  const stateLabels: Record<McpAuthState, string> = {
    ready: t`Ready`,
    needs_secret: t`Needs a secret`,
  };

  const saveSecret = async (event: FormEvent) => {
    event.preventDefault();
    const secret: McpSecretInput | null =
      auth.kind === "bearer"
        ? { kind: "token", token: value }
        : auth.kind === "basic"
          ? { kind: "basic", password: value }
          : auth.kind === "header"
            ? { kind: "header", value }
            : null;
    if (!secret || !value) return;
    if (await onSecret(secret)) {
      setEditing(false);
      setValue("");
    }
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-ui flex items-center gap-2 font-medium">
            {server.name}
            {state && (
              <Badge tone={state === "ready" ? "success" : "destructive"}>
                {stateLabels[state]}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-label truncate">
            {server.url} · {authLabels[auth.kind]}
          </p>
        </div>
        {auth.kind !== "none" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={t`Change the secret for ${server.name}`}
            disabled={disabled}
            onClick={() => setEditing(!editing)}
          >
            <Trans>Secret</Trans>
          </Button>
        )}
        <label className="text-muted-foreground text-label flex items-center gap-2">
          <Trans>On</Trans>
          <Switch
            aria-label={t`Use ${server.name}`}
            checked={server.enabled ?? true}
            disabled={disabled}
            onCheckedChange={(enabled) => onUpdate({ enabled })}
          />
        </label>
        <label className="text-muted-foreground text-label flex items-center gap-2">
          <Trans>Allow changes</Trans>
          <Switch
            aria-label={t`Allow ${server.name} to make changes`}
            checked={server.allow_changes ?? false}
            disabled={disabled}
            onCheckedChange={(allow_changes) => onUpdate({ allow_changes })}
          />
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={t`Remove ${server.name}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trans>Remove</Trans>
        </Button>
      </div>
      {editing && (
        <form className="flex gap-2" onSubmit={saveSecret}>
          <Input
            aria-label={t`New secret for ${server.name}`}
            type="password"
            placeholder={
              auth.kind === "basic" ? t`New password` : t`New access token`
            }
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button type="submit" variant="outline" size="sm" disabled={!value}>
            <Trans>Save</Trans>
          </Button>
        </form>
      )}
    </li>
  );
}
