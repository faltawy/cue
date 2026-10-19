# Releasing Cue

Releases live in the private repo `faltawy/cue`. The installed app reads them with a read-only GitHub token that you paste into Settings.

## 1. Repository secrets (once)

Set these in GitHub under Settings > Secrets and variables > Actions:

| Secret                                        | Value                                           | Status           |
| --------------------------------------------- | ----------------------------------------------- | ---------------- |
| `APPLE_CERTIFICATE`                           | base64 of the code-signing `.p12`               | set              |
| `APPLE_CERTIFICATE_PASSWORD`                  | password of that `.p12`                         | set              |
| `TAURI_SIGNING_PRIVATE_KEY`                   | contents of `~/.tauri/cue-updater.key`          | **owner to add** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`          | contents of `~/.tauri/cue-updater.key.password` | **owner to add** |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` | Apple Developer ID notarization (optional)      | not set: skipped |

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY -R faltawy/cue < ~/.tauri/cue-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R faltawy/cue < ~/.tauri/cue-updater.key.password
```

The updater public key in `apps/desktop/src-tauri/tauri.conf.json` is `~/.tauri/cue-updater.key.pub`. The release workflow fails if the private key doesn't match it.

## 2. Cut a release

```sh
git switch main && git pull
git tag -a v0.2.0 -m "What changed, in a line or two"
git push origin v0.2.0
```

`.github/workflows/release.yaml` stamps the version from the tag, builds and signs `Cue.app`, and checks the signature, the absence of Homebrew links and the updater signature. It then publishes a GitHub Release with the DMG, `.app.tar.gz`, `.sig` and `latest.json`. The tag message becomes the release notes. A tag without a message gets GitHub's generated notes. A tag like `v0.3.0-beta.1` is published as a prerelease, which installed apps ignore.

To rebuild an existing tag, delete its release first, then run the workflow by hand (Actions > Release > Run workflow, `tag: v0.2.0`).

## 3. Turn on updates in the app (each Mac)

1. Open https://github.com/settings/personal-access-tokens/new and create a fine-grained token:
   - Resource owner: `faltawy`. Repository access: Only select repositories, then `faltawy/cue`.
   - Permissions: Repository permissions > Contents: **Read-only**. Nothing else.
2. In Cue, open Settings > General > Updates, paste the token and choose Save. It is stored in the macOS Keychain and never shown again. Use Remove to clear it.

Cue checks 30 seconds after launch and every 6 hours. Updates download in the background. "Restart" (in Settings or the tray) installs the update, but never while a recording is running or the coach is answering. Only the stable app (`com.hyprnote.stable`) updates. Dev builds show that updates are unavailable.

## 4. First install of a self-signed build

The DMG isn't notarized until an Apple Developer ID is set up. To install it:

1. Open the DMG and drag Cue to Applications.
2. In Applications, right-click Cue and choose Open, then Open again in the dialog. On recent macOS versions, if there is no Open button, go to System Settings > Privacy & Security and choose "Open Anyway".

Later versions arrive through the in-app updater, so you only do this once.
