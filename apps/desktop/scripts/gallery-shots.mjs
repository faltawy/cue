#!/usr/bin/env node
// Screenshots of the dev component gallery (src/dev/gallery): a light and a
// dark PNG per scene, through headless Chrome and the DevTools protocol only.
//
//   pnpm -F @anlg/desktop dev            # Vite on :1422
//   node apps/desktop/scripts/gallery-shots.mjs [scene,...] [--rtl] [--out dir]
//
// Scenes: components, floating, dialog, palette (default: all). Elements with
// `data-force="hover|active|focus|focus-visible"` are drawn in that state.
// CHROME overrides the browser path; GALLERY_URL the page.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const scenes = (
  args.find((a) => !a.startsWith("--")) ?? "components,floating,dialog,palette"
).split(",");
const rtl = args.includes("--rtl");
const out = args.includes("--out")
  ? args[args.indexOf("--out") + 1]
  : join(tmpdir(), "cue-gallery");
const url = process.env.GALLERY_URL ?? "http://localhost:1422/dev/gallery";
const chrome =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const width = 920;

mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "cue-gallery-chrome-"));
const browser = spawn(chrome, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "--hide-scrollbars",
  "--force-color-profile=srgb",
  "about:blank",
]);

const endpoint = await new Promise((resolve, reject) => {
  let log = "";
  browser.stderr.on("data", (chunk) => {
    log += chunk;
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
    if (match) resolve(match[1]);
  });
  browser.on("exit", (code) =>
    reject(new Error(`Chrome exited (${code}): ${log}`)),
  );
});

const socket = new WebSocket(endpoint);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
let nextId = 0;
const pending = new Map();
const listeners = new Set();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else {
    for (const listener of listeners) listener(message);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shot(scene, theme, extra, file) {
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const call = (method, params) => send(method, params, sessionId);
  await call("Page.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height: 800,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const loaded = new Promise((resolve) => {
    const listener = (message) => {
      if (
        message.sessionId === sessionId &&
        message.method === "Page.loadEventFired"
      ) {
        listeners.delete(listener);
        resolve();
      }
    };
    listeners.add(listener);
  });
  await call("Page.navigate", {
    url: `${url}?theme=${theme}&scene=${scene}${extra}`,
  });
  await loaded;
  await call("Runtime.evaluate", {
    expression: "document.fonts.ready.then(() => true)",
    awaitPromise: true,
  });
  await sleep(800);
  await call("DOM.enable");
  await call("CSS.enable");
  const { root } = await call("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await call("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: "[data-force]",
  });
  for (const nodeId of nodeIds) {
    const { attributes } = await call("DOM.getAttributes", { nodeId });
    const states = attributes[attributes.indexOf("data-force") + 1].split(" ");
    const forced = states.includes("focus-visible")
      ? ["focus", "focus-visible"]
      : states;
    await call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: forced });
  }
  await sleep(250);
  const { cssContentSize } = await call("Page.getLayoutMetrics");
  const { data } = await call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width,
      height: Math.ceil(cssContentSize.height),
      scale: 1,
    },
  });
  writeFileSync(file, Buffer.from(data, "base64"));
  await send("Target.closeTarget", { targetId });
  console.log(file);
}

try {
  for (const scene of scenes) {
    for (const theme of ["light", "dark"]) {
      await shot(scene, theme, "", join(out, `${scene}-${theme}.png`));
    }
    if (rtl)
      await shot(scene, "light", "&dir=rtl", join(out, `${scene}-rtl.png`));
  }
} finally {
  socket.close();
  const exited = new Promise((resolve) => browser.once("exit", resolve));
  browser.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
