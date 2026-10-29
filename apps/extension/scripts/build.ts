import tailwind from "bun-plugin-tailwind";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const destination = path.join(root, "dist");
const resources = path.resolve(
  root,
  "../desktop/src-tauri/resources/browser-extension",
);
const identity = JSON.parse(
  await readFile(path.join(root, "identity.json"), "utf8"),
);
const { version } = JSON.parse(
  await readFile(path.resolve(root, "../desktop/package.json"), "utf8"),
);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const entry of ["background", "content", "panel"]) {
  const built = await Bun.build({
    entrypoints: [path.join(root, `src/${entry}.ts`)],
    outdir: destination,
    target: "browser",
    format: "iife",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  if (!built.success) throw new Error(built.logs.map(String).join("\n"));
}
const css = await Bun.build({
  entrypoints: [path.join(root, "src/panel.css")],
  outdir: destination,
  plugins: [tailwind],
  minify: true,
});
if (!css.success) throw new Error(css.logs.map(String).join("\n"));
for (const file of ["panel.html", "cue-mark.svg"])
  await cp(path.join(root, "src", file), path.join(destination, file));
await cp(
  path.resolve(root, "../desktop/src-tauri/icons/stable/128x128.png"),
  path.join(destination, "icon.png"),
);
await writeFile(
  path.join(destination, "host.json"),
  JSON.stringify({ host: "com.hyprnote.stable.browser" }),
);
await writeFile(
  path.join(destination, "manifest.json"),
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Cue for Meet",
      version,
      key: identity.key,
      description: "Private meeting cues and context for the Cue desktop app.",
      minimum_chrome_version: "116",
      permissions: ["nativeMessaging", "storage", "activeTab", "scripting"],
      host_permissions: ["https://meet.google.com/*", "http://127.0.0.1/*"],
      background: { service_worker: "background.js" },
      action: { default_title: "Open Cue", default_icon: "icon.png" },
      icons: { "128": "icon.png" },
      web_accessible_resources: [
        {
          resources: [
            "panel.html",
            "panel.js",
            "panel.css",
            "icon.png",
            "cue-mark.svg",
          ],
          matches: ["https://meet.google.com/*"],
        },
      ],
      content_scripts: [
        {
          matches: ["https://meet.google.com/*"],
          js: ["content.js"],
          run_at: "document_idle",
        },
      ],
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; connect-src 'self' http://127.0.0.1:*",
      },
    },
    null,
    2,
  ),
);
await mkdir(resources, { recursive: true });
await cp(destination, resources, { recursive: true });
console.log(`Built Cue extension ${identity.id}`);
