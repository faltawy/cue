import path from "node:path";

import stage from "./index.html";
import panel from "./panel.html";

// Dev-only: the Meet coach without Meet or Cue. Real dock/animation code, fixture data.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 4791),
  development: { hmr: true, console: true },
  routes: {
    "/": stage,
    "/panel": panel,
    "/cue-mark.svg": Bun.file(
      path.join(import.meta.dir, "../src/cue-mark.svg"),
    ),
  },
});

console.error(`extension preview: http://${server.hostname}:${server.port}/`);
