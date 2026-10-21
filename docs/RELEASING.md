# Releasing Cue

Source code, user guides, version tags and releases live in the public repository [`faltawy/cue`](https://github.com/faltawy/cue). Standard GitHub-hosted runners build releases there. The old `cue-releases` repository remains available for existing download links and its compatibility updater feed.

## 1. Repository secrets (once)

Set these on `faltawy/cue` under Settings > Secrets and variables > Actions:

| Secret                                        | Value                                               | Status           |
| --------------------------------------------- | --------------------------------------------------- | ---------------- |
| `APPLE_CERTIFICATE`                           | base64 of the code-signing `.p12`                   | set              |
| `APPLE_CERTIFICATE_PASSWORD`                  | password of that `.p12`                             | set              |
| `TAURI_SIGNING_PRIVATE_KEY`                   | contents of `~/.tauri/cue-updater.key`              | set              |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`          | contents of `~/.tauri/cue-updater.key.password`     | set              |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple Developer ID notarization (optional)          | not set: skipped |

The updater public key in `apps/desktop/src-tauri/tauri.conf.json` is `~/.tauri/cue-updater.key.pub`. The release workflow fails if the private key doesn't match it.

### Release permissions

The workflow uses its built-in `GITHUB_TOKEN` with `contents: write` to publish in `faltawy/cue`; no personal token is needed for new releases.

The 0.5.1 workflow uses `RELEASES_TOKEN` once to publish the final compatibility feed in `cue-releases`. Subsequent releases write only to `cue` and need no cross-repository token.

## 2. Release notes

Every user-visible change adds a changeset in the same PR:

```sh
pnpm changeset
```

Pick `@anlg/desktop`, then `patch` for fixes or `minor` for new features (never `major`), and write what users notice, not how it was built (`.changeset/README.md`). The notes are public: no commit hashes, links, issue numbers, names, or model and vendor names. The `Changeset` check fails a PR that touches `apps/`, `plugins/` or `crates/` without one; add the `no-changeset` label when users won't notice the change.

## 3. Cut a release

```sh
git switch main && git pull
pnpm release:version
git add -A && git commit -m "Release Cue 0.2.0"
git push
git tag -a v0.2.0 -m "Cue 0.2.0"
git push origin v0.2.0
```

`pnpm release:version` consumes the pending changesets, bumps the version in `apps/desktop/package.json`, `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`, appends to `apps/desktop/CHANGELOG.md`, and writes the release notes to `packages/changelog/content/desktop/<version>.md`, which the app shows in What's new. Review that file before committing; the tag must match the new version.

`.github/workflows/release.yaml` first reads `packages/changelog/content/desktop/<version>.md` and fails if it is missing. It stamps the version from the tag, builds and signs `Cue.app`, and checks the signature, the absence of Homebrew links and the updater signature. It then publishes a release with the same tag on `faltawy/cue` using its existing source tag with the DMG, `.app.tar.gz`, `.sig` and `latest.json`, and checks that the update downloads from its public URL. The notes file becomes the release notes; the tag message is not used. A tag like `v0.3.0-beta.1` is published as a prerelease, which installed apps ignore.

To rebuild an existing tag, delete its release in `cue` first, preserving the source tag, then run the workflow by hand (Actions > Release > Run workflow, `tag: v0.2.0`):

```sh
gh release delete v0.2.0 -R faltawy/cue
```

## 4. Updates in the app

Nothing to set up. Cue reads `https://github.com/faltawy/cue/releases/latest/download/latest.json` 30 seconds after launch and every 6 hours, and checks each download against the updater public key. Updates download in the background. "Restart to update" (in Settings > General > Updates or the tray) installs the update, but never while a recording is running or the coach is answering. Only the stable app (`com.hyprnote.stable`) updates. Dev builds show that updates are unavailable.

Versions 0.1.4 through 0.5.0 read the old `cue-releases` feed. The 0.5.1 release updates that feed once to point at its signed download in `cue`. After installing 0.5.1, those apps poll `cue` for subsequent updates. Archive `cue-releases` only after verifying this final feed and copying all published releases to `cue`. Keep the archived repository available for the compatibility feed and historical download links; do not delete it.

## 5. First install of a self-signed build

Current builds use a self-signed certificate, not an Apple-issued Developer ID, and skip notarization. macOS may block the first launch because it cannot verify the developer or check the app for malicious software.

Download from https://github.com/faltawy/cue/releases/latest and follow the [installation instructions](../README.md#install), including the per-app **Open Anyway** step. The [troubleshooting guide](troubleshooting.md#cue-wont-open-the-first-time) explains the warning and what to do if the button is missing.

To remove the unidentified-developer warning for future releases, use an Apple-issued Developer ID Application certificate and configure notarization. Apple provides these distribution capabilities through its [Developer Program](https://developer.apple.com/programs); eligible organizations can apply for a [membership fee waiver](https://developer.apple.com/help/account/membership/fee-waivers/).
