const ACCOUNT_MODES = [
  "--auth-status",
  "--sign-in",
  "--claude-code-status",
  "--update-claude-code",
  "--prepare-claude-code",
  "--prepare-codex",
];

if (process.argv.includes("--llm-only")) await import("./llm-server");
else if (process.argv.includes("--list-connectors"))
  await import("./list-connectors");
else if (ACCOUNT_MODES.some((mode) => process.argv.includes(mode)))
  await import("./account-cli");
else await import("./server");

export {};
