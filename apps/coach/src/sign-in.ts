function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function signInCommand(claudePath: string | undefined): string[] {
  const command = `${claudePath ? shellQuote(claudePath) : "claude"} /login`;
  return [
    "osascript",
    "-e",
    `tell application "Terminal" to do script ${appleScriptString(command)}`,
    "-e",
    'tell application "Terminal" to activate',
  ];
}
