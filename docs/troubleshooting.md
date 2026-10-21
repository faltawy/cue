# Troubleshooting

This page lists common problems and how to fix them. If yours isn't here, [report it](#report-a-problem).

## macOS asks for my password after an update

Cue keeps API keys and tool passwords in your login Keychain. After an update, macOS may ask for your login password once so the new version can read them. Enter it and choose **Always Allow**.

If saving an API key fails with "macOS cannot access your login Keychain", click **Repair Keychain Access**. Cue locks your login Keychain for a moment, and macOS asks for your Mac password to unlock it. Cue then saves the key again.

## Cue won't open the first time

macOS may say the developer cannot be verified or Apple cannot check Cue for malicious software. Current Cue releases use a self-signed certificate rather than an Apple-issued Developer ID and have not been notarized by Apple. Apple therefore cannot verify the developer or confirm that the app passed its malware checks.

If you trust the copy you downloaded from the [official Cue releases](https://github.com/faltawy/cue/releases/latest):

1. Drag **Cue** from the DMG into **Applications**, then try opening it.
2. Dismiss the warning and open **System Settings → Privacy & Security**.
3. Scroll to **Security** and click **Open Anyway** next to the message about Cue.
4. Confirm **Open** and authenticate with your Mac password or Touch ID if asked.

macOS saves an exception, so you can open that copy normally afterward. **Open Anyway** is available for about an hour after an attempted launch; if it is missing, try opening Cue again. A managed work Mac may restrict this option; contact your administrator.

These steps apply to an unverified-developer or missing-notarization warning. If macOS says Cue will damage your computer or contains malware, do not override it; [report the exact warning](#report-a-problem).

See Apple’s [instructions for opening an app blocked by security settings](https://support.apple.com/en-sg/guide/mac-help/mh40617/mac). No Terminal commands or system-wide security changes are needed.

## "Live transcription is not configured"

You started recording without a working transcription model. Cue is still saving the audio.

1. Click **Configure**, or open **Settings → Transcription**.
2. Pick a model under **Model being used**.
3. For a cloud service, add its API key under **Configure Providers**. For a model on your Mac, click **Download** and wait until it's ready.
4. Open the note and choose **Re-transcribe** from the Transcript tab menu to transcribe the saved audio.

## The live transcript stopped

The transcript says why. Common reasons:

- You're offline, or Cue can't reach the service. Cue keeps recording and tries again by itself. When it can reach the service, it fills in the missing part from the recording.
- The connection is slow (from 0.2.0). Cue keeps trying. You don't need to do anything.
- The service rejected your API key. Check the key in **Settings → Transcription**. Cue doesn't try again until you fix it.
- The service is down. Wait, or choose another service and re-transcribe later.

If the transcript still has gaps after the meeting, the Transcript tab says "This transcript is incomplete." Cue keeps the audio and tries again. You can also choose **Re-transcribe**.

## Cue doesn't hear me, or doesn't hear the others

- In **Settings → Permissions**, check that Microphone and System audio are both allowed.
- In **Settings → Meetings → Audio**, check the **Microphone**.
- During a meeting, Cue warns you with "No audio is being captured" or tells you which source stopped.

## The coach doesn't open

- Press ⇧⌘K, or choose **Coach** in the menu bar menu.
- If the shortcut does nothing, another app may use the same keys. Choose new keys in **Settings → General → Coach shortcut**.
- If the coach shows "Connecting to the coach…" for a long time, quit Cue with ⌘Q and open it again.

## The coach asks me to sign in

Click **Sign in**, or **Sign in again**. Claude opens Terminal; Codex opens your browser to sign in with ChatGPT. When you're done, come back and click **Try again**. You can also sign in from **Settings → AI**. See [AI setup](setup.md#choose-your-ai-provider).

## "Usage limit reached" or a provider connection error

Your provider is limiting requests on your plan, or Cue can't reach it. Wait a moment, then click **Try again**. Summaries use the account selected in AI settings, so they may stop working at the same time.

## "Nudges paused"

Nudges reached the spend limit for this meeting, or Cue could not estimate the cost of the selected model. You can still ask the coach questions. To raise the limit, change **Spend limit per meeting** in **Settings → AI**.

## I don't get coach nudges

- Check that **Nudges** is on in **Settings → AI**.
- Your model must be a **Live** one, so the coach can follow the meeting while it happens.
- If the coach panel is hidden, nudges show as notifications only when **Coach nudges** is on in **Settings → Notifications**.

## There's no summary

Cue skips the summary when a meeting has only a few words. Click **Generate summary** in the Summary tab to try anyway. If you aren't signed in to your selected AI provider, sign in first.

## A permission stopped working

macOS sometimes forgets permissions, for example after an update.

1. Open **Settings → Permissions**. A row with a warning icon needs attention.
2. Click the button on that row to open the right page in System Settings.
3. Turn Cue off and on again there, then restart Cue.

For the calendar, **Settings → Calendar → Having trouble?** can reset the permission and ask again.

## Find the logs

Cue writes its log to `~/Library/Logs/com.hyprnote.stable/app.log`. Older logs are `app.log.1` to `app.log.5`. To open the folder, choose **Go → Go to Folder…** in Finder and paste `~/Library/Logs/com.hyprnote.stable`.

## Report a problem

Open an issue at [github.com/faltawy/cue/issues](https://github.com/faltawy/cue/issues). Please include:

- Your Cue version (in **Settings → General → Updates**) and your macOS version
- What you did, what you expected, and what happened
- The part of `app.log` from when it happened, if you can

Logs can contain details about your meetings. Read what you attach and remove anything private.
