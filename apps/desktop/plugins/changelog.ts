import { readdirSync, readFileSync, watch } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin, ViteDevServer } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const changelogDir = resolve(
  __dirname,
  "../../../packages/changelog/content/desktop",
);

const VIRTUAL_ID = "virtual:changelog";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

function buildModule(dir: string): string {
  const changelogs = Object.fromEntries(
    readdirSync(dir, { withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && /^\d+\.\d+\.\d+\.md$/.test(entry.name),
      )
      .map((entry) => [
        entry.name.slice(0, -3),
        readFileSync(resolve(dir, entry.name), "utf-8"),
      ]),
  );

  return `export const changelogs = ${JSON.stringify(changelogs)};`;
}

export function changelog(dir = changelogDir): Plugin {
  return {
    name: "changelog",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id === RESOLVED_ID) return buildModule(dir);
    },
    configureServer(server: ViteDevServer) {
      if (process.env.NODE_ENV === "test" || process.env.VITEST) {
        return;
      }

      try {
        watch(dir, { recursive: true }, () => {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({ type: "full-reload" });
          }
        });
      } catch {}
    },
  };
}
