import { APP_TOKEN_ENV, APP_URL_ENV } from "@anlg/assistant/app-bridge";

import { TOKEN_ENV } from "./access";

const INHERITED_CREDENTIALS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
const COACH_ONLY = [APP_URL_ENV, APP_TOKEN_ENV, TOKEN_ENV];

const LOCAL_ONLY = {
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  DISABLE_TELEMETRY: "1",
  DISABLE_ERROR_REPORTING: "1",
  DISABLE_AUTOUPDATER: "1",
};

export function sessionEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const routedElsewhere = Boolean(env.ANTHROPIC_BASE_URL);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || COACH_ONLY.includes(key)) continue;
    if (!routedElsewhere && INHERITED_CREDENTIALS.includes(key)) continue;
    result[key] = value;
  }
  return { ...result, ...LOCAL_ONLY };
}
