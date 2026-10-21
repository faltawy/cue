# Releasing Cue

The source code and user guides live in the public repo [`faltawy/cue`](https://github.com/faltawy/cue). Builds are published to [`faltawy/cue-releases`](https://github.com/faltawy/cue-releases). Keep that repository available: installed apps download updates from its release feed without credentials. Its former documentation pages link to the guides here.

## 1. Repository secrets (once)

Set these on `faltawy/cue` under Settings > Secrets and variables > Actions:

| Secret                                        | Value                                               | Status           |
| --------------------------------------------- | --------------------------------------------------- | ---------------- |
| `APPLE_CERTIFICATE`                           | base64 of the code-signing `.p12`                   | set              |
| `APPLE_CERTIFICATE_PASSWORD`                  | password of that `.p12`                             | set              |
| `TAURI_SIGNING_PRIVATE_KEY`                   | contents of `~/.tauri/cue-updater.key`              | set              |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`          | contents of `~/.tauri/cue-updater.key.password`     | set              |
| `RELEASES_TOKEN`                              | fine-grained token that publishes to `cue-releases` | **owner to add** |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple Developer ID notarization (optional)          | not set: skipped |

The updater public key in `apps/desktop/src-tauri/tauri.conf.json` is `~/.tauri/cue-updater.key.pub`. The release workflow fails if the private key doesn't match it.

### Create `RELEASES_TOKEN`

1. Open https://github.com/settings/personal-access-tokens/new.
2. Resource owner: `faltawy`. Repository access: Only select repositories, then `faltawy/cue-releases`.
3. Permissions: Repository permissions > Contents: **Read and write**. Nothing else.
4. Generate the token and store it:

```sh
gh secret set RELEASES_TOKEN -R faltawy/cue
```

The workflow stops at its first step if the secret is missing or can't reach `faltawy/cue-releases`. When the token expires, create a new one the same way.

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

`.github/workflows/release.yaml` first reads `packages/changelog/content/desktop/<version>.md` and fails if it is missing. It stamps the version from the tag, builds and signs `Cue.app`, and checks the signature, the absence of Homebrew links and the updater signature. It then publishes a release with the same tag on `faltawy/cue-releases` (the tag is created there on `main`) with the DMG, `.app.tar.gz`, `.sig` and `latest.json`, and checks that the update downloads from its public URL. The notes file becomes the release notes; the tag message is not used. A tag like `v0.3.0-beta.1` is published as a prerelease, which installed apps ignore.

To rebuild an existing tag, delete its release and tag on `cue-releases` first, then run the workflow by hand (Actions > Release > Run workflow, `tag: v0.2.0`):

```sh
gh release delete v0.2.0 -R faltawy/cue-releases --cleanup-tag
```

## 4. Updates in the app

Nothing to set up. Cue reads `https://github.com/faltawy/cue-releases/releases/latest/download/latest.json` 30 seconds after launch and every 6 hours, and checks each download against the updater public key. Updates download in the background. "Restart to update" (in Settings > General > Updates or the tray) installs the update, but never while a recording is running or the coach is answering. Only the stable app (`com.hyprnote.stable`) updates. Dev builds show that updates are unavailable.

Versions before this change read releases from the private repo with a GitHub token. They don't see `cue-releases`, so install the next version on those Macs by hand once (section 5). You can then delete the old read-only token on GitHub.

## 5. First install of a self-signed build

The DMG isn't notarized until an Apple Developer ID is set up. Download it from https://github.com/faltawy/cue-releases/releases/latest, then:

1. Open the DMG and drag Cue to Applications.
2. In Applications, right-click Cue and choose Open, then Open again in the dialog. On recent macOS versions, if there is no Open button, go to System Settings > Privacy & Security and choose "Open Anyway".

Later versions arrive through the in-app updater, so you only do this once.
