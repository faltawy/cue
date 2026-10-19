# Cue

Cue is a macOS meeting notepad with a live coach. It captures your device audio without a bot joining the call, transcribes it, and keeps sessions, notes and transcripts in a local SQLite database on your Mac. The coach is a side panel that follows the meeting and nudges you while it happens; it runs Claude through the bundled Claude Code runtime and your Claude Code sign-in.

This repository holds only the desktop app and the coach; there is no Cue server.

## Layout

- `apps/desktop`: the Tauri 2 app (React, TypeScript, Vite) and its Rust host in `apps/desktop/src-tauri`.
- `apps/coach`: the coach, a Bun sidecar compiled into the app bundle. `plugins/coach` starts and talks to it.
- `crates/*`, `plugins/*`: Rust crates and Tauri plugins the app links.
- `packages/*`: shared TypeScript packages (UI, editor, database adapters).

## Build and run on macOS

Requirements: macOS 15+, Xcode with the Metal toolchain, Node 22, pnpm (version in `package.json#packageManager`), Bun, Rust (version in `rust-toolchain.toml`) and [process-compose](https://github.com/F1bonacc1/process-compose).

```sh
pnpm install
(cd apps/coach && bun install && bun run build:sidecar)   # builds the coach and Claude runtime sidecars
pnpm dev                                                   # builds shared UI, then runs the app with the dev feature
```

A signed local bundle:

```sh
cd apps/desktop
APPLE_SIGNING_IDENTITY="<your codesign identity>" pnpm exec tauri build --debug --bundles app --features dev
```

Checks:

```sh
pnpm -F @anlg/ui build && pnpm -F @anlg/desktop typecheck && pnpm -F @anlg/desktop test
(cd apps/coach && bun run typecheck && bun test)
cargo check -p desktop --features dev
cargo test -p tauri-plugin-coach
```

## Licence

Cue is based on [Anarlog](https://github.com/fastrepl/anarlog) by Fastrepl, Inc., under the [MIT License](LICENSE). The coach includes code adapted from Catamorphic under Apache-2.0; see [`apps/coach/NOTICE`](apps/coach/NOTICE) and [LICENSING.md](LICENSING.md).
