if (process.argv.includes("--llm-only")) await import("./llm-server");
else if (process.argv.includes("--list-connectors")) await import("./list-connectors");
else await import("./server");

export {};
