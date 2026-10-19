import { copyFileSync } from "node:fs";
import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const root = path.resolve(import.meta.dir, "..");
const binaries = path.resolve(root, "../desktop/src-tauri/binaries");

const result = await Bun.build({
  entrypoints: [path.join(root, "src/main.ts")],
  compile: { outfile: path.join(binaries, "anarlog-coach-aarch64-apple-darwin") },
  plugins: [tailwind],
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

copyFileSync(
  path.join(root, "node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"),
  path.join(binaries, "anarlog-claude-aarch64-apple-darwin"),
);

console.error(`built ${result.outputs.map((output) => path.relative(root, output.path)).join(", ")}`);
