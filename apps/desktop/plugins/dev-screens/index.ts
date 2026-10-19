// Dev-only screen harness: renders the real app in a plain browser with the
// Tauri backend replaced by fixtures, so every screen can be screenshotted
// (docs/design/cue-audit.md §7). Opt in with CUE_SCREENS=1 on the Vite dev
// server; the production build and the normal dev server never load it.
//
// SQL runs against a seeded in-memory copy of the real schema (the migrations
// in crates/db-app) through node:sqlite. Every other command is answered by
// `fixtures.ts`; anything unknown resolves to null and is logged once.
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { Plugin } from "vite";

import { type Dataset, type DatasetName, isDatasetName } from "./dataset";
import { DATASET_BUILDERS } from "./datasets";
import { fixture } from "./fixtures";
import { seed } from "./seed";

const root = resolve(import.meta.dirname, "../../../..");

function migrate(db: DatabaseSync) {
  const lib = readFileSync(resolve(root, "crates/db-app/src/lib.rs"), "utf8");
  const start = lib.indexOf("APP_MIGRATION_STEPS: &[");
  const block = lib.slice(start, lib.indexOf("\n];", start));
  for (const [, file] of block.matchAll(
    /include_str!\("\.\.\/migrations\/([^"]+)"\)/g,
  )) {
    const sql = readFileSync(
      resolve(root, "crates/db-app/migrations", file),
      "utf8",
    );
    // Triggers the Rust side installs at runtime are absent here.
    db.exec(
      sql.replace(/DROP TRIGGER (?!IF EXISTS)/g, "DROP TRIGGER IF EXISTS "),
    );
  }
}

function createDatabase(dataset: Dataset) {
  const db = new DatabaseSync(":memory:");
  migrate(db);
  seed(db, dataset);
  return db;
}

type Params = SQLInputValue[];

function bind(params: unknown[] | undefined): Params {
  return (params ?? []).map((value) => {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === undefined) return null;
    if (value !== null && typeof value === "object")
      return JSON.stringify(value);
    return value as SQLInputValue;
  });
}

function isRead(sql: string) {
  return /^\s*(with|select|pragma|explain)\b/i.test(sql);
}

function run(db: DatabaseSync, sql: string, params: unknown[] | undefined) {
  const statement = db.prepare(sql);
  if (isRead(sql) || /\breturning\b/i.test(sql))
    return statement.all(...bind(params));
  statement.run(...bind(params));
  return [];
}

let nextSubscription = 1;

function handle(
  db: DatabaseSync,
  dataset: Dataset,
  cmd: string,
  args: Record<string, unknown>,
): { payload: unknown; write?: boolean; rows?: unknown[] } {
  switch (cmd) {
    case "plugin:db|execute": {
      const sql = String(args.sql);
      return {
        payload: run(db, sql, args.params as unknown[]),
        write: !isRead(sql),
      };
    }
    case "plugin:db|execute_proxy": {
      const sql = String(args.sql);
      const statement = db.prepare(sql);
      statement.setReturnArrays?.(true);
      const params = bind(args.params as unknown[]);
      if (args.method === "run") {
        statement.run(...params);
        return { payload: { rows: [] }, write: true };
      }
      const rows = statement.all(...params);
      return {
        payload: { rows: args.method === "get" ? (rows[0] ?? []) : rows },
        write: !isRead(sql),
      };
    }
    case "plugin:db|execute_transaction": {
      const statements = args.statements as {
        sql: string;
        params: unknown[];
      }[];
      db.exec("BEGIN");
      try {
        const counts = statements.map(
          ({ sql, params }) =>
            Number(db.prepare(sql).run(...bind(params)).changes) || 0,
        );
        db.exec("COMMIT");
        return { payload: counts, write: true };
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    case "plugin:db|subscribe":
      return {
        payload: {
          id: `sub-${nextSubscription++}`,
          analysis: { kind: "reactive", data: { tables: [] } },
        },
        rows: run(db, String(args.sql), args.params as unknown[]),
      };
    default:
      return { payload: fixture(cmd, args, dataset.fixtures) };
  }
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((done, fail) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => done(data));
    req.on("error", fail);
  });
}

export function devScreens(): Plugin {
  const enabled = process.env.CUE_SCREENS === "1";
  return {
    name: "cue-dev-screens",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      // One dataset at a time (dataset.ts); the toggle in shim.js and the
      // screenshot script pick it with ?data=<name>.
      let name: DatasetName = "demo";
      let dataset = DATASET_BUILDERS[name]();
      let db = createDatabase(dataset);
      const load = (next: DatasetName) => {
        name = next;
        dataset = DATASET_BUILDERS[next]();
        db = createDatabase(dataset);
      };
      const requested = (req: IncomingMessage) => {
        const value = new URL(req.url ?? "", "http://screens").searchParams.get(
          "data",
        );
        return isDatasetName(value) ? value : null;
      };
      server.middlewares.use("/__cue_screens/shim.js", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript");
        res.end(readFileSync(resolve(import.meta.dirname, "shim.js"), "utf8"));
      });
      server.middlewares.use("/__cue_screens/reset", (req, res) => {
        load(requested(req) ?? name);
        res.end(name);
      });
      // Page loads switch the dataset only when it differs, so edits made in
      // the app survive a reload.
      server.middlewares.use("/__cue_screens/dataset", (req, res) => {
        const next = requested(req);
        if (next && next !== name) load(next);
        res.end(name);
      });
      // Seeds and screen setup run SQL here directly (the screenshot script).
      server.middlewares.use("/__cue_screens/sql", async (req, res) => {
        const { sql, params } = JSON.parse(await body(req)) as {
          sql: string;
          params?: unknown[];
        };
        res.setHeader("Content-Type", "application/json");
        try {
          res.end(JSON.stringify(run(db, sql, params)));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify(String(error)));
        }
      });
      server.middlewares.use("/__cue_screens/invoke", async (req, res) => {
        const { cmd, args } = JSON.parse(await body(req)) as {
          cmd: string;
          args: Record<string, unknown>;
        };
        res.setHeader("Content-Type", "application/json");
        try {
          res.end(
            JSON.stringify({
              ok: true,
              ...handle(db, dataset, cmd, args ?? {}),
            }),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(`[screens] ${cmd} failed: ${message}`);
          res.end(JSON.stringify({ ok: false, payload: message }));
        }
      });
    },
    transformIndexHtml(html) {
      if (!enabled) return html;
      return html.replace(
        '<script src="/relay-shim.js"></script>',
        '<script src="/__cue_screens/shim.js"></script>\n    <script src="/relay-shim.js"></script>',
      );
    },
  };
}
