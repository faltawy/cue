#!/usr/bin/env node
// Screenshots of real app screens through the dev screen harness
// (plugins/dev-screens): headless Chrome over the DevTools protocol, one PNG
// per scene and theme, at a 1280×800 window.
//
//   CUE_SCREENS=1 pnpm -F @anlg/desktop dev        # Vite on :1422
//   node apps/desktop/scripts/screen-shots.mjs [scene,...] [--tag after]
//        [--themes light,dark] [--rtl] [--base http://localhost:1422]
//        [--out /tmp/cue-redesign]
//
// Files are named b-<scene>[-<tag>]-<theme>.png (and -rtl-<theme> with --rtl).
// Every shot starts from a freshly seeded database.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SCENES } from "./screen-scenes.mjs";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback;
const positional = args.filter(
  (arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--"),
);
const only = positional[0]?.split(",");
const tag = option("tag", "");
const base = option("base", "http://localhost:1422");
const out = option("out", "/tmp/cue-redesign");
const themes = option("themes", "light,dark").split(",");
const rtl = args.includes("--rtl");
const debug = args.includes("--debug");
const chrome =
  process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const WIDTH = 1280;
const HEIGHT = 800;

mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "cue-screens-chrome-"));
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

async function sql(statement, params = []) {
  const response = await fetch(`${base}/__cue_screens/sql`, {
    method: "POST",
    body: JSON.stringify({ sql: statement, params }),
  });
  if (!response.ok) throw new Error(`${statement}: ${await response.text()}`);
}

const setting = (key, value) =>
  sql(
    "INSERT OR REPLACE INTO app_settings (id, value_json, updated_at) VALUES (?, ?, ?)",
    [key, JSON.stringify(value), new Date().toISOString()],
  );

// Finds a visible element by its accessible name or text and returns the
// centre of its box, in CSS pixels.
const FIND = `(query) => {
  const { text, selector, nth = 0, exact = false, contains = false } = query;
  const pool = document.querySelectorAll(selector ?? "button, [role=button], [role=menuitem], [role=menuitemradio], [role=tab], [role=option], [role=checkbox], [role=switch], [role=radio], a, label, input, textarea, [contenteditable=true], summary, li, span, div, p, h1, h2, h3");
  const name = (el) => (el.getAttribute("aria-label") ?? el.getAttribute("title") ?? el.innerText ?? el.value ?? "").trim().replace(/\\s+/g, " ");
  const hits = [...pool].filter((el) => {
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    if (text === undefined) return true;
    const value = name(el);
    return exact ? value === text : contains ? value.includes(text) : value === text || value.startsWith(text);
  });
  hits.sort((a, b) => name(a).length - name(b).length);
  const el = hits[nth];
  if (!el) return null;
  if (query.activate) {
    (el.closest("button, [role=button], a") ?? el).click();
    return { x: 0, y: 0 };
  }
  el.scrollIntoView({ block: "nearest" });
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}`;

const KEYS = {
  ",": { code: "Comma", keyCode: 188 },
  ".": { code: "Period", keyCode: 190 },
  Escape: { code: "Escape", keyCode: 27 },
  Enter: { code: "Enter", keyCode: 13 },
  ArrowDown: { code: "ArrowDown", keyCode: 40 },
  Tab: { code: "Tab", keyCode: 9 },
};
const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

async function shot(scene, theme, direction, file) {
  await fetch(`${base}/__cue_screens/reset`);
  await setting("theme", theme);
  if (direction === "rtl") await setting("ai_language", "ar");
  for (const statement of scene.sql ?? []) await sql(statement);

  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const call = (method, params) => send(method, params, sessionId);
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(
        `${scene.name}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
      );
    return result.value;
  };
  const locate = async (query, tries = 20) => {
    for (let attempt = 0; attempt < tries; attempt++) {
      const point = await evaluate(`(${FIND})(${JSON.stringify(query)})`);
      if (point) return point;
      await sleep(250);
    }
    throw new Error(`${scene.name}: nothing matches ${JSON.stringify(query)}`);
  };
  const mouse = (type, { x, y }, extra = {}) =>
    call("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });

  await call("Page.enable");
  const errors = [];
  const onConsole = (message) => {
    if (
      message.sessionId !== sessionId ||
      message.method !== "Runtime.consoleAPICalled" ||
      message.params.type !== "error"
    )
      return;
    const text = message.params.args
      .map((arg) => arg.value ?? arg.description ?? "")
      .join(" ");
    const frame = message.params.stackTrace?.callFrames
      ?.map((f) => `${f.url.split("/src/").pop()}:${f.lineNumber + 1}`)
      .slice(0, 4)
      .join(" < ");
    errors.push(`${text.slice(0, 240)} @ ${frame}`);
  };
  if (debug) {
    listeners.add(onConsole);
    await call("Runtime.enable");
  }
  await call("Emulation.setDeviceMetricsOverride", {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await call("Emulation.setFocusEmulationEnabled", { enabled: true });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: theme }],
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
    url: `${base}${scene.url ?? "/app/main"}`,
  });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await locate({ text: scene.ready ?? "Weekly sync with Lumen" }, 60);
  await sleep(600);

  for (const step of scene.steps ?? []) {
    if (step.click || step.find) {
      const point = await locate(
        typeof (step.click ?? step.find) === "string"
          ? { text: step.click ?? step.find }
          : (step.click ?? step.find),
      );
      if (step.click) {
        await mouse("mouseMoved", point);
        await mouse("mousePressed", point, { clickCount: 1 });
        await mouse("mouseReleased", point, { clickCount: 1 });
      }
    } else if (step.activate) {
      await locate({
        ...(typeof step.activate === "string"
          ? { text: step.activate }
          : step.activate),
        activate: true,
      });
    } else if (step.hover) {
      await mouse(
        "mouseMoved",
        await locate(
          typeof step.hover === "string" ? { text: step.hover } : step.hover,
        ),
      );
    } else if (step.key) {
      const key = KEYS[step.key] ?? {
        code: `Key${step.key.toUpperCase()}`,
        keyCode: step.key.toUpperCase().charCodeAt(0),
      };
      const modifiers = (step.mods ?? []).reduce(
        (sum, mod) => sum + MODIFIERS[mod],
        0,
      );
      const event = {
        key: step.key,
        code: key.code,
        windowsVirtualKeyCode: key.keyCode,
        modifiers,
      };
      await call("Input.dispatchKeyEvent", { type: "keyDown", ...event });
      await call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
    } else if (step.type) {
      await call("Input.insertText", { text: step.type });
    } else if (step.eval) {
      await evaluate(step.eval);
    }
    await sleep(step.wait ?? 350);
  }

  if (!scene.keepToasts)
    await evaluate(
      `document.head.insertAdjacentHTML("beforeend", "<style>[data-app-toaster], [data-sonner-toaster] { display: none !important; }</style>")`,
    );
  await sleep(scene.settle ?? 500);
  const { data } = await call("Page.captureScreenshot", {
    format: "png",
    clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
  });
  writeFileSync(file, Buffer.from(data, "base64"));
  listeners.delete(onConsole);
  for (const error of errors) console.warn(`  ! ${error}`);
  await send("Target.closeTarget", { targetId });
  console.log(file);
}

let failed = 0;
try {
  for (const scene of SCENES) {
    if (only && !only.includes(scene.name)) continue;
    const directions = rtl ? ["rtl"] : ["ltr"];
    for (const direction of directions)
      for (const theme of themes) {
        const variant = direction === "rtl" ? `rtl-${theme}` : theme;
        try {
          await shot(
            scene,
            theme,
            direction,
            join(
              out,
              `${["b", scene.name, tag, variant].filter(Boolean).join("-")}.png`,
            ),
          );
        } catch (error) {
          failed++;
          console.error(`✗ ${scene.name} ${variant}: ${error.message}`);
        }
      }
  }
} finally {
  socket.close();
  const exited = new Promise((resolve) => browser.once("exit", resolve));
  browser.kill();
  await exited;
  rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
}
process.exitCode = failed ? 1 : 0;
