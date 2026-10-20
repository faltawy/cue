function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

export function signInCommand(claudePath: string): string[] {
  const command = `${shellQuote(claudePath)} /login`;
  return [
    "osascript",
    "-e",
    `tell application "Terminal" to do script ${appleScriptString(command)}`,
    "-e",
    'tell application "Terminal" to activate',
  ];
}
