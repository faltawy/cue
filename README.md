# Cue

Cue is a meeting notepad for your Mac with a live coach. It records your meetings without a bot joining the call, writes the transcript and a summary, and gives you a coach on the side of your screen that follows the conversation and tells you what to say next.

Your notes, transcripts and recordings stay on your Mac. There is no Cue account and no Cue server.

## What you need

- A Mac with Apple silicon (M1 or later) running macOS 15 Sequoia or later
- A Claude subscription or a ChatGPT account with Codex access. Choose either for summaries and the coach.
- A way to transcribe speech. This can be a free model that runs on your Mac, or an API key from a transcription service you choose.

## Start here

New to Cue? Follow these steps in order. Each takes a minute or two.

1. [Install Cue](#install) and open it.
2. Allow permissions. Cue asks for the microphone, system audio and Accessibility. → [Permissions](docs/setup.md#allow-permissions)
3. Connect your calendar (optional) for reminders and automatic recording. → [Calendar](docs/setup.md#connect-your-calendar)
4. Choose Claude or Codex during setup and sign in, or do it later in **Settings → AI**. → [AI setup](docs/setup.md#choose-your-ai-provider)
5. Choose how to transcribe. In **Settings → Transcription**, download a model or paste an API key. → [Transcription](docs/setup.md#choose-how-to-transcribe)
6. Record your first meeting. Press ⇧⌘N, then click **Stop** when you're done. → [Recording](docs/recording.md)
7. Open the coach with ⇧⌘K and keep it beside your call. → [The coach](docs/coach.md)

## Install

1. Download `Cue_<version>_aarch64.dmg` from the [latest release](https://github.com/faltawy/cue/releases/latest).
2. Open the DMG and drag **Cue** into **Applications**.
3. Do this the first time only. In Applications, right-click **Cue**, choose **Open**, then click **Open** again. Cue isn't notarized by Apple yet, so macOS blocks a double-click the first time. If you don't see an **Open** button, go to **System Settings → Privacy & Security** and click **Open Anyway**.

New versions then install from inside Cue. See [Updates](docs/updates.md).

After an update, macOS may ask for your login password once so the new version can read the keys Cue saved in your Keychain. Enter it and choose **Always Allow**.

## Guides

| Guide | What's in it |
| ----- | ------------ |
| [Setup](docs/setup.md) | Permissions, AI providers, transcription, calendar, notifications, menu bar |
| [Recording meetings](docs/recording.md) | Start and stop, transcript, speakers, summary, upload, export, what happens if something goes wrong |
| [The coach](docs/coach.md) | Asking, Catch me up, nudges, wrap-up, what the coach can and can't do |
| [Notes, folders and tags](docs/notes.md) | Finding notes, writing, folders, tags, locking, deleting, calendar |
| [Contacts](docs/people.md) | People, organizations and meeting participants |
| [Templates](docs/templates.md) | How summaries are laid out |
| [Automations](docs/automations.md) | Save every meeting as a Markdown file |
| [Dictation and dictionary](docs/dictation.md) | Speak into any app; teach Cue your words |
| [Keyboard shortcuts](docs/shortcuts.md) | Every shortcut in one place |
| [Settings reference](docs/settings.md) | Every setting, page by page |
| [Privacy and your data](docs/privacy.md) | What leaves your Mac, where your data lives, how to delete it |
| [Updates](docs/updates.md) | How updates arrive and what's new |
| [Troubleshooting](docs/troubleshooting.md) | Fixes for common problems, logs, reporting a bug |

## Get help

Found a problem? [Open an issue](https://github.com/faltawy/cue/issues). [Troubleshooting](docs/troubleshooting.md#report-a-problem) lists what to include.

## Development

### Layout

- `apps/desktop`: the Tauri 2 app (React, TypeScript, Vite) and its Rust host in `apps/desktop/src-tauri`.
- `apps/coach`: the coach, a Bun sidecar compiled into the app bundle. `plugins/coach` starts and talks to it.
- `crates/*`, `plugins/*`: Rust crates and Tauri plugins the app links.
- `packages/*`: shared TypeScript packages (UI, editor, database adapters).

### Build and run on macOS

Requirements: macOS 15+, Xcode with the Metal toolchain, Node 22, pnpm (version in `package.json#packageManager`), Bun, Rust (version in `rust-toolchain.toml`) and [process-compose](https://github.com/F1bonacc1/process-compose).

```sh
pnpm install
(cd apps/coach && bun install && bun run build:sidecar)   # builds the coach sidecar
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

Cue is based on [Anarlog](https://github.com/fastrepl/anarlog) by Fastrepl, Inc., under the [MIT License](LICENSE). See [LICENSING.md](LICENSING.md).
