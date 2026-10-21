# Setup

The first time you open Cue, it walks you through capture permissions, calendar, your AI provider and transcription readiness. Microphone and system audio are needed to record; calendar and AI are optional. Recording still works if you skip calendar or AI setup. Transcripts and summaries need a configured transcription model and AI provider respectively.

At the end of setup, you can choose **Try a short test recording**. Cue creates a clearly named test note and starts the normal recording flow only after you click the button. Return to setup after checking the note and choose **Delete test note**; stop the recording first if it is still active. Audio is saved on your Mac. If a remote transcription service is configured, it processes the test audio under your current provider settings; on-device models keep processing local.

If macOS blocks Cue before setup opens, follow the [first-launch warning instructions](troubleshooting.md#cue-wont-open-the-first-time).

To open Settings, press ⌘, (Command and comma), click **Settings** in the menu bar menu, or search for Settings with ⌘K.

## Allow permissions

Cue asks for these on first launch. You can check and fix them later in **Settings → Permissions**.

| Permission          | What Cue uses it for                                                            |
| ------------------- | ------------------------------------------------------------------------------- |
| Microphone          | Recording your voice                                                            |
| System audio        | Recording the other people on the call (the sound your Mac plays)               |
| Accessibility       | Typing dictation into other apps, and reading meeting controls and visible chat |
| Calendar (optional) | Showing your Apple Calendar events                                              |

For Accessibility, Cue opens System Settings and shows you where to add it.

Turning on **Capture shared screens in Memos** (in **Settings → Meetings**) also needs Screen Recording.

### How do I fix a permission?

1. Open **Settings → Permissions**. A row with a warning icon isn't allowed yet.
2. Click the button on that row. Cue asks again, or opens the right page in System Settings.
3. In System Settings, turn Cue on (or off and on again), then restart Cue.

## Connect your calendar

Connecting your calendar is optional. With it, Cue reminds you before meetings, can start and stop recording for you, and knows who is in each meeting.

Cue reads the calendars on your Mac through Apple Calendar, so any account you've added to macOS shows up, including Google and Exchange.

1. If your calendar is Google, first add the account in **System Settings → Internet Accounts** and turn on Calendars.
2. In Cue, open **Settings → Calendar**, or use the calendar step during setup.
3. Click **+** (**Connect Apple Calendar**) and allow access.
4. Turn on the calendars you want. **Refresh calendars** picks up new ones.

The **…** menu next to the account has **Reconnect** and **Disconnect**. If access is turned off, Cue explains how to turn it back on. **Having trouble?** offers to ask for access again, reset it, or open System Settings.

## Choose your AI provider

In **Settings → AI**, choose **Claude** or **Codex** for summaries, titles and coaching. Claude is the default. Each provider keeps its own sign-in and model preference, so switching does not remove the other account.

New coach chats use your selection. Existing chats keep their original provider; choose **New chat** to switch. Changing a provider's model preference also applies when you reopen its existing chats.

### Sign in to Claude

Choose **Claude**, then **Sign in** during setup or in **Settings → AI**. Terminal opens to finish signing in. Follow its instructions, then return to Cue.

If you already use Claude Code on this Mac, Cue uses the same sign-in, so you may already be signed in. You don't need an API key; usage counts against your Claude plan.

### Sign in to Codex

Choose **Codex**, then **Sign in**. Your browser opens to sign in with your ChatGPT account. Return to Cue when authentication finishes.

Cue downloads the Codex runtime on first use. You don't need to install a command-line tool or provide an API key. Cue keeps this sign-in separate from Claude and from any Codex installation you already use.

### AI settings

All in **Settings → AI**:

| Setting                 | What it does                                                                                                        | Default                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Provider                | Claude or Codex for new chats, summaries, titles and background coaching                                            | Claude                             |
| Sign-in                 | Shows the selected provider's account; **Sign in** or **Sign in again**                                             |                                    |
| Model                   | Claude: Sonnet, Opus or Haiku. Codex: leave blank for its default, or enter a model name available to your account. | Sonnet for Claude; blank for Codex |
| Coach project           | A folder the coach can read, such as your docs                                                                      | None                               |
| Nudges                  | While you record, the coach speaks up on its own when a question, promise or number may need you                    | On                                 |
| Spend limit per meeting | Nudges pause when they reach this estimated amount in one meeting ($0.01 to $100). Asking the coach always works.   | $0.50                              |
| Web access              | The coach can search the web and read public pages when you ask                                                     | On                                 |

The same page holds **Coach instructions**, **Knowledge** and **Tools**. **Claude connectors** work only with Claude; their settings are preserved when you switch to Codex. See [The coach](coach.md).

## Choose how to transcribe

Cue needs a transcription model to turn audio into text. If none is set up when you record, Cue still saves the audio and shows "Live transcription is not configured" with a **Configure** button.

### How do I set up transcription?

1. Open **Settings → Transcription**.
2. Under **Model being used**, pick a provider and a model.
3. Then either:
   - For a model on your Mac, click **Download** next to it. Cue marks the one that is **Best for this Mac**. Nothing leaves your Mac.
   - For a cloud service, find it under **Configure Providers**, open it, and paste your key in **API Key**. Some services also need a **Base URL**. It saves on its own, and Cue offers to make it the current provider.

Your API keys are kept in your Mac's Keychain.

### Live or after recording?

Each model either writes the transcript during the meeting (**Live**) or only after you stop (**After recording**). The coach follows the live transcript, so pick a live model if you want coaching during meetings.

### Which providers are there?

- On your Mac: Soniqo, Apple Speech, or your own whisper.cpp `.bin` model file (after recording only).
- In the cloud, with your own key: Deepgram, AssemblyAI, OpenAI, ElevenLabs, Soniox, Speechmatics, Gladia, Google, Azure, Amazon, Groq, Mistral and many more.
- Your own server: Any Deepgram-compatible server, by its address.

### Languages

In **Settings → General → Language & Region**:

- **Main language** is the usual language for transcription and AI answers.
- **Additional spoken languages** are other languages your meetings use. They help transcription and the choice of summary language.

If a model can't handle your languages, the Transcription page says so. If a live model can't handle them together in a meeting, Cue uses your main language and tells you. Apple Speech may ask you to add a language in macOS System Settings first.

Add names, acronyms and product terms in **Settings → Dictionary** so they're spelled right. See [Dictionary](dictation.md#dictionary).

## Notifications

Cue shows its own alerts, so macOS doesn't ask for notification permission. Set them in **Settings → Notifications**.

| Option                      | What it does                                                                                    | Default |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ------- |
| Disable all notifications   | Turn off every alert, Dock bounce and sound                                                     | Off     |
| Summary complete            | Tell you when a summary is ready                                                                | On      |
| Coach nudges                | Show the coach's suggestion when its window isn't in front                                      | On      |
| Event notifications         | Remind you 5 minutes before each event, with **Join & record** or **Start recording**           | On      |
| Recording status prompts    | Ask before stopping when a meeting may have ended. When off, Cue keeps recording.               | On      |
| Completion sound            | Play a sound when transcription or a summary finishes; choose one of five sounds and preview it | On      |
| Bounce app icon             | Bounce the Dock icon when a summary is ready in the background (only when Cue is in the Dock)   | On      |
| Microphone detection        | Ask "Are you in a meeting?" when an app starts using your microphone                            | On      |
| Respect Do-Not-Disturb mode | Hold event and microphone alerts while Do Not Disturb is on                                     | Off     |

Under **Microphone detection** you can set the **Detection delay** (5 seconds to 2 minutes, default 15 seconds) and **Exclude apps from detection**. Some apps are excluded by default and marked "(default)".

## General settings

In **Settings → General**:

- **Your name** is shown for your voice in transcripts, and the coach listens for it. Cue fills it in from your Mac account the first time.
- **Start Cue at login**, **Show app in Dock** and **Show tray icon** (the menu bar icon).
- **Coach shortcut**, explained in [Change the coach shortcut](coach.md#change-the-coach-shortcut).
- Language & Region has the main language, **Use main language for summaries**, additional spoken languages, timezone and the first day of the week.
- **Export location** (under Storage) is where exported files go. It is Downloads at first.
- Updates, explained in [Updates](updates.md).

## Menu bar and Dock

With **Show tray icon** on, Cue has a menu bar icon. While you record, the menu bar shows the meeting's title. Otherwise, with **Show events in menu bar** on, it shows your current or next event and how long until it starts or ends.

The menu bar menu has:

- Your next few events today and tomorrow. Click an event to open its note. If the event has a meeting link, choose **Join & record** under it to open the link and start recording.
- **Show events in menu bar**
- **Open Cue**, **Start a new meeting** (or **Stop recording** while you record), and **Settings**
- **Coach** and **Coach Project…**
- Your version, and **Restart to Update** when an update is ready
- **Hide** and **Quit Cue**

The Dock icon's menu has **New Note**, **Open Cue**, **Settings** and **Restart Cue**.

### How do I quit Cue?

Press ⌘Q, choose **Quit** from the Dock, or **Quit Cue** in the menu bar menu. If you're recording, Cue asks first, then stops and saves the recording before it quits.

Closing the window doesn't quit Cue. Cue stays in the menu bar so it can remind you about meetings and record them.
