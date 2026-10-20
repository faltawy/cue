import { readFileSync, watch } from "node:fs";
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
  const version = process.env.VITE_APP_VERSION || null;
  let content: string | null = null;

  if (version) {
    try {
      content = readFileSync(resolve(dir, `${version}.md`), "utf-8");
    } catch {}
  }

  return [
    `export const latestVersion = ${JSON.stringify(version)};`,
    `export const latestContent = ${JSON.stringify(content)};`,
  ].join("\n");
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
