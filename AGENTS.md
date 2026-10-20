# Overview

Cue is a macOS meeting notepad with a live coach, forked from Anarlog. It is a pnpm and Rust workspace. Read the nearest `AGENTS.md` before changing a component.

- `apps/desktop/`: Tauri 2 with React, TypeScript, Vite, and Tailwind. Zustand owns UI state; TanStack Query/Form own queries, mutations, and forms. The Rust host is `apps/desktop/src-tauri` (package `desktop`).
- `apps/coach/`: the coach, a Bun sidecar outside the pnpm workspace (own `bun.lock`). `bun run build:sidecar` compiles it into `apps/desktop/src-tauri/binaries/`. The app ships no Claude Code: the coach runs the person's own when it is at least the SDK's version, else downloads Cue's integrity-pinned copy into the app's cache on first use (`apps/coach/src/claude-code.ts`; `apps/coach/scripts/claude-code-bump.ts` moves the pins). `plugins/coach/` launches it and owns its settings.
- `crates/db-app/`: canonical SQLite schema and migrations. `db-core` owns runtime initialization, `db-migrate` owns migration execution, and `plugins/db/` exposes the transport. React consumes these through `packages/db-runtime`, `packages/db-react`, and `packages/db-tauri`; `packages/db` is the Drizzle adapter.
- `docs/design/`: the Cue design spec (`cue.md`) and its audit of the app.

Cue is macOS-only and ships by direct download (no App Store build); there are no Windows or Linux code paths.

Sessions are the core entity: all notes are backed by sessions. ProseMirror powers the editor (`packages/editor`, via `@handlewithcare/react-prosemirror`); documents use TipTap-dialect ProseMirror JSON, with converters/validation in `crates/tiptap`.

## Commands

- Install: `pnpm install --frozen-lockfile` and `cd apps/coach && bun install --frozen-lockfile`. Match Node 22, `package.json#packageManager`, and `rust-toolchain.toml`; keep lockfiles in sync with intentional dependency changes.
- Format: `pnpm exec dprint fmt --allow-no-files <changed-files>`; check: `pnpm exec dprint check --allow-no-files <changed-files>`.
- Build shared UI before desktop checks: `pnpm -F @anlg/ui build`.
- Typecheck (TS): `pnpm -F @anlg/desktop typecheck`; coach: `cd apps/coach && bun run typecheck`.
- Typecheck (Rust): `cargo check --locked -p desktop --features dev`. `tauri.conf.json` adds the `direct-distribution` feature for bundles.
- Desktop dev: `pnpm dev` (Process Compose builds `@anlg/ui`, then runs `tauri dev --features dev`). The coach sidecar must be built first.
- Local signed bundle: `cd apps/desktop && APPLE_SIGNING_IDENTITY=<identity> pnpm exec tauri build --debug --bundles app --features dev`.

## Pre-commit verification

`.github/workflows/desktop_ci.yaml` is the source of truth. Run the checks for what you touched:

| Changed component                              | Validation                                                                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop frontend and shared UI/editor packages | Build `@anlg/ui`, then `pnpm -F @anlg/desktop typecheck`, `pnpm -F @anlg/desktop test`, `pnpm lint:oxlint`, and `pnpm -F @anlg/desktop i18n:check`. |
| Coach                                          | In `apps/coach`: `bun run typecheck`, `bun test`, `bun run build:sidecar`; `cargo test -p tauri-plugin-coach` when the plugin changes.             |
| Desktop Rust and plugins                       | `cargo check --locked -p desktop --features dev`, plus `cargo test -p <crate>` for touched crates.                                                  |
| CloudSync and local SQLite                     | `cargo test --locked -p cloudsync`, `cargo test --locked -p db-core 'cloudsync::' -- --test-threads=1`, and tests for `db-app` / `db-migrate`.      |
| Root scripts                                   | `node --test scripts/*.test.mjs`.                                                                                                                  |

- Decide what to test, delete, or leave untested with `.agents/skills/testing/SKILL.md`: one regression test per fix, no tests for CSS, copy, mock call counts, private state, or file layout.
- Fix failures caused by the change before committing. If an unrelated failure or missing hardware blocks a check, record the exact command, result, and reason.

### Generated files and data compatibility

- Desktop i18n: when translated copy changes, run `pnpm -F @anlg/desktop exec lingui extract --clean --workers 1` and `pnpm -F @anlg/desktop exec lingui compile --strict --workers 1`, and commit the `apps/desktop/src/i18n/locales` changes. `i18n:check` diffs against HEAD, so run it on a clean catalog.
- Regenerate native bindings and permissions with their owning Rust build/generator; never hand-edit generated output. CI checks `plugins/db/js/bindings.gen.ts`, `plugins/db/permissions/autogenerated`, and `plugins/db/permissions/schemas/schema.json` for drift.
- Keep shipped SQLite migration IDs/SQL append-only and update the Drizzle adapter when schema changes affect it. Follow `crates/db-app/AGENTS.md` for CloudSync migration scope and table policy.

## Guidelines

- JavaScript/TypeScript formatting runs through `oxfmt` via dprint's exec plugin.
- Use `useForm` (tanstack-form) and `useQuery`/`useMutation` (tanstack-query) for form/mutation state. Avoid manual state management (e.g. `setError`).
- Keep schema creation, migrations, and DB initialization on the Rust side. TypeScript consumes the shared transport contracts; the Drizzle adapter uses `executeProxy` and must not parse SQL or remap named rows into positional rows.
- New SQLite migrations must be downgrade-safe: additive only, new columns nullable or with a DEFAULT. If a migration can't be, add a `-- breaking` line to the leading comment block of its `.sql` file so older builds refuse the database with an update prompt.
- UI follows `docs/design/cue.md`.
- Commit titles state the intent, not the diff or a ticket number.

## Code Style

- Avoid creating types/interfaces unless shared. Inline function props.
- Do not write comments unless code is non-obvious. Comments should explain "why", not "what".
- Use `cn` from `@anlg/utils` for conditional classNames. Always pass an array, split by logical grouping.
- Use `motion/react` instead of `framer-motion`.
- Prefer DOM order for local overlap and portals for cross-tree floating UI. Use `z-index` only inside a bounded stacking context with explicit sibling ordering.
- Do not create summary docs or example code files unless requested.
