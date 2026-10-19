/// <reference types="vitest" />

import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type UserConfig } from "vite";

import { relayShim } from "@anlg/plugin-relay/vite";

import { changelog } from "./plugins/changelog";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    devGallery(),
    relayShim(),
    changelog(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    lingui(),
    babel({
      presets: [linguiTransformerBabelPreset()],
    }),
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/autocomplete",
      "@codemirror/language",
      "@codemirror/lint",
      "@codemirror/lang-jinja",
      "codemirror-readonly-ranges",
      "@uiw/react-codemirror",
      "react",
      "react-dom",
    ],
  },
  test: {
    reporters: "default",
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    onConsoleLog: (_, type) => {
      return type === "stderr";
    },
    exclude: ["**/node_modules/**", "**/src-tauri/**"],
  },
  ...tauri,
}));

// The shared-component gallery (src/dev/gallery) at /dev/gallery. Dev server
// only: the production build keeps index.html as its single entry.
function devGallery(): Plugin {
  return {
    name: "cue-dev-gallery",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? "").split("?");
        if (path === "/dev/gallery" || path === "/dev/gallery/") {
          req.url = `/src/dev/gallery/index.html${query ? `?${query}` : ""}`;
        }
        next();
      });
    },
  };
}

// https://v2.tauri.app/start/frontend/vite/#update-vite-configuration
const tauri: UserConfig = {
  clearScreen: false,
  server: {
    port: 1422,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1423,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  build: {
    outDir: "./dist",
    chunkSizeWarningLimit: 500 * 10,
    target: "safari13",
    minify: process.env.TAURI_ENV_DEBUG ? false : "terser",
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
};
