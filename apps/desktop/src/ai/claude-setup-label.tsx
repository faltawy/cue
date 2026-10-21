import { Trans } from "@lingui/react/macro";

import type { ClaudeSetup } from "@anlg/plugin-coach";

export function ClaudeSetupLabel({
  setup,
  provider = "claude",
}: {
  setup: ClaudeSetup;
  provider?: "claude" | "codex";
}) {
  if (setup.state === "failed") return <>{setup.message}</>;
  if (setup.state === "ready") return null;
  const { percent } = setup;
  if (provider === "codex")
    return percent === null ? (
      <Trans>Setting up Codex…</Trans>
    ) : (
      <Trans>Setting up Codex… {percent}%</Trans>
    );
  return percent === null ? (
    <Trans>Setting up Claude…</Trans>
  ) : (
    <Trans>Setting up Claude… {percent}%</Trans>
  );
}
