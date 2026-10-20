import { Trans } from "@lingui/react/macro";

import type { ClaudeSetup } from "@anlg/plugin-coach";

/** "Setting up Claude… 45%", or why it failed. Nothing once Claude is ready. */
export function ClaudeSetupLabel({ setup }: { setup: ClaudeSetup }) {
  if (setup.state === "failed") return <>{setup.message}</>;
  if (setup.state === "ready") return null;
  const { percent } = setup;
  return percent === null ? (
    <Trans>Setting up Claude…</Trans>
  ) : (
    <Trans>Setting up Claude… {percent}%</Trans>
  );
}
