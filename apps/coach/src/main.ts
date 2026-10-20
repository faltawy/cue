if (process.argv.includes("--llm-only")) await import("./llm-server");
else if (process.argv.includes("--list-connectors")) await import("./list-connectors");
else if (process.argv.includes("--auth-status") || process.argv.includes("--sign-in")) await import("./account-cli");
else await import("./server");

export {};
