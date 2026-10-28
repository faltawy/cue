const ACCOUNT_MODES = [
  "--auth-status",
  "--sign-in",
  "--claude-code-status",
  "--update-claude-code",
  "--prepare-claude-code",
  "--prepare-codex",
];

const nativeOrigin = process.argv.find((argument) =>
  argument.startsWith("chrome-extension://"),
);
if (nativeOrigin) {
  try {
    await (await import("./native-messaging")).runNativeMessaging(nativeOrigin);
  } catch {
    console.error("browser_native_connection_failed");
    process.exitCode = 1;
  }
} else if (process.argv.includes("--llm-only")) await import("./llm-server");
else if (process.argv.includes("--list-connectors"))
  await import("./list-connectors");
else if (ACCOUNT_MODES.some((mode) => process.argv.includes(mode)))
  await import("./account-cli");
else await import("./server");

export {};
