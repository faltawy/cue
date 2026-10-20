import { parseArgs } from "node:util";

import { CLAUDE_ARGS, claudeCodeFromArgs } from "./claude-code";
import { findConnectors } from "./connectors";

const DISCOVERY_TIMEOUT_MS = 10_000;

const { values } = parseArgs({
  options: {
    "list-connectors": { type: "boolean" },
    ...CLAUDE_ARGS,
  },
});

const found = await findConnectors({
  claudePath: await claudeCodeFromArgs(values).executable(),
  timeoutMs: DISCOVERY_TIMEOUT_MS,
});
await Bun.write(Bun.stdout, JSON.stringify(found));
