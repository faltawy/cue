import path from "node:path";
import { parseArgs } from "node:util";

import { findConnectors } from "./connectors";

const DISCOVERY_TIMEOUT_MS = 10_000;

const { values } = parseArgs({
  options: {
    "list-connectors": { type: "boolean" },
    claude: { type: "string" },
  },
});

const found = await findConnectors({
  claudePath: values.claude ? path.resolve(values.claude) : undefined,
  timeoutMs: DISCOVERY_TIMEOUT_MS,
});
await Bun.write(Bun.stdout, JSON.stringify(found));
