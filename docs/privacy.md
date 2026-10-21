# Privacy and your data

Your notes, transcripts and recordings live on your Mac. Cue has no account and no Cue server. Some data leaves your Mac only because you chose a service for it, and this page lists each case.

## What leaves your Mac?

| What                                                                      | Where it goes                                                       | When                                                                                                                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Meeting audio                                                             | The transcription service you chose in **Settings → Transcription** | While you record (live models), after you stop (after-recording models), and when you re-transcribe or upload audio. Nothing is sent if your model runs on your Mac. |
| Meeting text: transcript, memos, participant names, your dictionary words | Your selected AI provider (Claude or Codex), through its sign-in    | When Cue writes a title or summary, and when the coach answers, nudges or writes a wrap-up                                                                           |
| Files from your coach project and knowledge files                         | The provider used by the coach chat                                 | Only the parts the coach reads to answer you                                                                                                                         |
| Your past notes and contacts                                              | The provider used by the coach chat                                 | Only what the coach looks up to answer you                                                                                                                           |
| Web searches and web pages                                                | The web                                                             | Only if **Web access** is on and the coach looks something up                                                                                                        |
| Requests to connectors and tools                                          | The services you turned on in **Settings → AI**                     | Only when the coach uses them                                                                                                                                        |
| Dictation audio                                                           | Your transcription service                                          | While you dictate, if dictation is on                                                                                                                                |
| A check for updates                                                       | GitHub, where Cue's releases are published                          | 30 seconds after Cue opens, then every 6 hours                                                                                                                       |
| AI runtime downloads                                                      | The provider's package host                                         | When Cue needs to set up or update its AI runtime                                                                                                                    |
| Model downloads                                                           | The site that hosts the model                                       | When you download a transcription model                                                                                                                              |

The optional onboarding test recording uses the same capture and transcription path as a meeting. Cue does not start it automatically; you start it from setup. The test note is stored locally and can be deleted from the setup card after recording stops. Remote transcription services receive that audio when selected, just like other recordings.

Existing coach chats keep their original provider when you change the selection in Settings. New chats, summaries and background coaching use your current selection.

Cue reads your calendar from your Mac. It doesn't connect to Google or iCloud itself. macOS keeps your accounts in sync.

## Does Cue track me?

No. Cue has no analytics, no usage tracking and no crash reporting. The Claude tools inside Cue run with their own usage reporting turned off.

## What stays on your Mac?

- Notes, memos, summaries and transcripts
- Recordings, for as long as **Audio file retention** says (in **Settings → Meetings**)
- Voiceprints from **Remember speakers**. They never leave your Mac, and Cue deletes unnamed ones after 45 days.
- The coach's chats and settings
- Your nudge feedback and the category preferences Cue derives from it
- API keys and tool passwords, in your Mac's Keychain

Locked notes open only with Touch ID or your Mac password. The coach sees only their titles. Locking hides a note in Cue but doesn't encrypt the file on your disk.

## Where is my data?

| Folder                                               | What's in it                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `~/Library/Application Support/Cue/`                 | Your notes, recordings, settings, search index, downloaded models and coach chats |
| `~/Library/Application Support/com.hyprnote.stable/` | Coach settings                                                                    |
| `~/Library/Logs/com.hyprnote.stable/`                | Log files                                                                         |
| `~/Library/Caches/com.hyprnote.stable/codex/`        | Downloaded Codex runtime, its separate sign-in and conversation state             |

Older versions of Cue used a different folder name. Cue moves your data to the Cue folder the first time you open a newer version.

API keys and tool passwords are in your login Keychain, in items whose names end in `secure-store`.

You can't move the data folder. Exports go to the folder set in **Settings → General → Export location**.

## How do I delete my data?

To delete one note, right-click it in the list or use its **⋯** menu. To delete only a recording, choose **Delete recording** in the Transcript tab menu. To keep recordings for less time, change **Audio file retention**.

To delete everything:

1. Quit Cue with ⌘Q.
2. In Finder, choose **Go → Go to Folder…** and delete these folders:
   - `~/Library/Application Support/Cue`
   - `~/Library/Application Support/com.hyprnote.stable`
   - `~/Library/Logs/com.hyprnote.stable`
   - `~/Library/Caches/com.hyprnote.stable/codex`
3. Open the Keychain Access app, search for `secure-store`, and delete the Cue items it finds.
4. Drag Cue from Applications to the Trash.
5. Optional: to clear the permissions you gave Cue, open Terminal and run `tccutil reset All com.hyprnote.stable`.

You can't undo this. Export anything you want to keep first.
