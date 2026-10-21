# Recording meetings

Cue records your microphone and the sound your Mac plays (the other people on the call), so it works with any meeting app without a bot joining. After you stop, it finishes the transcript and writes a summary.

## How do I start recording?

Any of these works:

- Press ⇧⌘N for a new note that starts recording right away.
- Open a note and click **Record** in its header.
- If the note came from a calendar event with a meeting link, click **Join & record**: Cue opens the link and starts recording.
- In the menu bar menu, choose **Start a new meeting**, or **Join & record** under one of your upcoming events.
- In the 5-minute meeting reminder, click **Join & record** (or **Start recording** if the event has no link).
- When Cue notices your microphone in use, it asks "Are you in a meeting?". Click **Yes**.
- Let Cue start for you. See [Start and stop automatically](#start-and-stop-automatically).

⌘N makes a note without recording.

## How do I stop recording?

- Click **Stop** in the note header, or **Stop recording** in the menu bar menu.
- Or let Cue stop when the call ends (on by default).

When you stop, Cue finishes the transcript and writes a summary, and the coach writes its [wrap-up](coach.md#after-the-meeting).

To carry on in the same note later, choose **Resume listening** from the note's **⋯** menu or the Transcript tab menu.

## Start and stop automatically

In **Settings → Meetings**:

| Setting | What it does | Default |
| ------- | ------------ | ------- |
| Start when meeting begins | Start recording when a scheduled meeting begins | On |
| Join scheduled meetings | Also open the meeting link (needs the setting above) | Off |
| Stop when meeting ends | Stop recording when your call ends | On |

Automatic start needs a [connected calendar](setup.md#connect-your-calendar) and only applies to events with a meeting link that aren't all-day. If your Mac was asleep, Cue still picks up a meeting that started in the last 5 minutes.

Automatic stop waits until the meeting app lets go of the microphone. When Cue isn't sure the call ended, for example a meeting in a browser, it asks "Did your meeting end?" and stops after 30 seconds; click **Stop** to stop at once. With **Recording status prompts** off in **Settings → Notifications**, Cue keeps recording instead.

## Meeting chat and shared screens

Also in **Settings → Meetings**, all off by default:

- **Post recording disclosure in meeting chat**. When recording starts, Cue posts "I'm using Cue to record and transcribe this meeting." in the meeting chat (Zoom, Google Meet, Teams, Slack huddles, Webex). The message tells people about the recording but does not record their consent. Cue tells you if it couldn't post.
- **Capture meeting chat in Memos**. Cue saves the visible meeting chat into the note's Memos under "Meeting chat". If someone writes "I do not consent", "don't consent" or "stop recording" in the chat, Cue stops recording and tells you.
- **Capture shared screens in Memos**. Cue saves slides and screens that others share, under "Shared screens". This needs Screen Recording permission.

## Microphone and recordings

In **Settings → Meetings → Audio**:

- **Microphone** is the microphone that records your voice. "Current default" follows macOS.
- **Audio file retention** is how long recordings stay on your Mac. Choose Don't save, 1 day, 3 days, 1 week, 1 month, or Forever (the default).
- **Remember speakers**. See [Fix who said what](#fix-who-said-what).

If a device stops working mid-meeting, Cue keeps recording what it can and says so, for example "Microphone unavailable. System audio continues".

## What's in a note

Each meeting is a note with three tabs:

- **Summary** is what Cue writes after the meeting. The tab has the name of the template it used, or "Summary".
- **Memos** are your own notes. Type here during the meeting, and Cue uses them when it writes the summary. Saved chat and shared screens appear here too.
- **Transcript** is what people said, by speaker.

### The live transcript

While you record, the Transcript tab fills in as people speak, if your model is a **Live** one. With an **After recording** model, the tab says "Batch transcription mode" and the transcript appears when you stop. See [Choose how to transcribe](setup.md#choose-how-to-transcribe).

## Fix who said what

Your voice shows as your name (from **Settings → General → Your name**) or "You". Others show by name when Cue knows the only other participant, otherwise as "Speaker 1", "Speaker 2" and so on.

To change a speaker:

1. Select text in the transcript and choose **Change speaker** (or **Change speaker from here**).
2. Pick a participant or contact, or type a new name.
3. Leave **Apply to all** on to change every matching line from that speaker, or turn it off to change only the selected part.

With **Remember speakers** on (the default), Cue learns the voices you name and recognizes them in later meetings. These voiceprints never leave your Mac, and unnamed ones are deleted after 45 days.

### Edit the transcript

The Transcript tab menu has:

- **Edit transcript**, then **Done editing** when you finish
- **Copy**
- **Re-transcribe** transcribes the recording again with your current model. It needs the recording.
- **Delete recording**

Selecting lines also offers **Merge**, **Delete**, **Edit**, **Play from here** and **Copy**.

## The summary

Cue writes the summary with your selected AI provider after you stop recording, or after you upload audio or a transcript. Very short meetings are skipped ("Summary wasn't generated"); click **Generate summary** to try anyway.

- To use another template, click the summary tab and pick a template, or **Auto**. Cue writes the summary again with it. See [Templates](templates.md).
- To write the summary again, click **Regenerate** in the template picker, or right-click the summary tab. Right-click also has **Copy**, and **Remove** for extra summary tabs.
- Summaries are in the meeting's language. To always use your main language, turn on **Use main language for summaries** in **Settings → General → Language & Region**.

Cue tells you "Summary ready" when it's done (see [Notifications](setup.md#notifications)).

## Make a note from a recording or transcript

1. Make a new note (⌘N).
2. Choose **Upload audio** or **Upload transcript** from the note's **⋯** menu or the empty Transcript tab. You can also drag an audio file onto the note.

- Audio: WAV, MP3, OGG, MP4, M4A, FLAC, WEBM, AAC
- Transcripts: VTT, SRT

Cue transcribes the audio with your current model, then writes the summary.

## Export a note

1. In the note's **⋯** menu, choose **Export**.
2. Pick a **File format**: PDF (default), TXT, Markdown or Org.
3. Choose what to **Include**: Memo, Summary (on by default), Transcript.
4. Click **Export**.

The file goes to your export folder (Downloads unless you change **Settings → General → Storage → Export location**) and Cue shows it in Finder. The summary included is the one in the Summary tab you have open.

To save every meeting as Markdown automatically, see [Automations](automations.md).

## If something goes wrong during a meeting

### The connection drops or is slow

Cue keeps saving the audio to your Mac whatever happens to the connection. If the live transcript can't reach your transcription service, it says why, for example:

- "Live transcript paused because you're offline."
- "Live transcript paused because Cue can't reach Deepgram."
- "Slow connection to Deepgram. Live transcript is retrying." (from 0.2.0)

followed by "Your audio is still being saved, and the missing part will be filled in from the recording."

Cue reconnects on its own and transcribes the missing part from the recording once it can. From 0.2.0, it also keeps connecting on slow networks instead of pausing. It doesn't try again when the service rejects your API key. Fix the key in **Settings → Transcription**.

If parts are still missing after the meeting, the Transcript tab says "This transcript is incomplete." Cue keeps the untranscribed audio until it has been transcribed.

### Cue quits or crashes

Cue writes the audio to disk every second and saves transcript words as they arrive. If Cue stops unexpectedly, open the note after relaunching. Cue says "Cue saved this meeting's audio" and offers:

- **Create meeting note** transcribes and summarizes the saved audio.
- **Resume listening** carries on recording in the same note.

The saved audio is deleted once it has been transcribed.

If you quit Cue on purpose while recording, Cue asks first, then stops and saves the recording before quitting.
