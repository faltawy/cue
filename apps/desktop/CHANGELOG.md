# @anlg/desktop

## 0.10.1

### Patch Changes

- The home screen now shows the current app icon. Installation no longer displays outdated artwork.

## 0.10.0

### Minor Changes

- Live coaching drops outdated suggestions when the conversation moves on, keeping prompts tied to the current moment.

## 0.9.0

### Minor Changes

- Live coaching responds sooner to clear moments, stays quiet when you've already handled them, and keeps multilingual coaching for less obvious cues.

## 0.8.0

### Minor Changes

- Cue no longer includes Automations; manual Markdown exports remain available. The home screen now displays the Cue wordmark.

## 0.7.0

### Minor Changes

- Keep speaker names and transcript corrections in sync with the coach, quote a passage back into chat, and let the coach learn speaker names for future meetings when speaker memory is enabled.

## 0.6.2

### Patch Changes

- The coach starts correctly in the released app.

## 0.6.1

### Patch Changes

- Live coaching now works reliably after launch. Earlier release notes are available in the app.

## 0.6.0

### Minor Changes

- Improve multilingual coaching with local nudge feedback and clickable meeting evidence. Add guided setup readiness and an optional test recording, a Home dashboard for meetings and follow-ups, scannable transcript turn timestamps, and task-oriented Settings groups.

## 0.5.2

### Patch Changes

- Use the app’s current name throughout background activity, startup, exports and developer tools. Existing data and saved credentials remain available after updating.

## 0.5.1

### Patch Changes

- Updates now come from the same public repository as the source code and user guides. Existing installations continue to receive updates automatically.

## 0.5.0

### Minor Changes

- Choose your AI provider in Settings for summaries, titles and coaching, with separate sign-ins and model preferences. Existing coach chats keep their original provider; new chats use your selection.

## 0.4.0

### Minor Changes

- The coach opens beside your meeting when you start recording, without taking focus. You can turn this off in Settings → General → Coach. While you record, the note shows that the coach is listening and how many nudges it has given. The menu bar icon shows when the coach is listening and when a nudge is waiting. The home screen now leads with your next meeting and a button to record it with the coach. Claude now sits right under General in Settings, and Dictation and Automations have moved to the end of the list.

### Patch Changes

- Settings shows which Claude account you're signed in with, and the button to change it says Switch account.

## 0.3.0

### Minor Changes

- Cue's download and updates are much smaller. The coach uses your installed Claude Code when it's up to date; otherwise it downloads what it needs the first time you open it, and Settings > Claude shows which one it uses.

## 0.2.0

### Minor Changes

- The coach now steps in when the other side pushes back on price, timing, a current tool, a decision maker or doubt, and when you have been talking for a while, with a question to hand the floor back.
- You can now add and remove a note's tags yourself under Meeting info, with suggestions from the tags you already use.
- The Markdown export automation lets you choose what each file includes (memo, summary, transcript, action items) and how files are named, using the meeting date and title.
- ⌘K now finds notes by what's in them, not only their titles: it searches memos, summaries and transcripts, shows the matching passage with the words highlighted, and matches Arabic with or without diacritics. Locked notes are still found by title only.
- The sidebar now lists your folders with note counts. Click one to show only its notes, or All notes to see everything again, and use a folder's menu to add a subfolder, rename it, move it into another folder, or delete it.
- The sidebar lists your tags with note counts; click one to show only notes with that tag, and click it again to show everything. A new note made while a tag is selected gets that tag.

### Patch Changes

- The Accessibility permission now says that dictation needs it to type into other apps.
- Settings and onboarding now show whether Claude is signed in on this Mac and let you sign in from there, and the coach asks you to sign in instead of saying your sign-in expired when you never signed in.
- The coach stays out of Cue's own data folder even when it is reached through the old folder name.
- The coach now answers in the language you write to it in, and its nudges, wrap-up and follow-up draft use the language the meeting was held in.
- When the coach window is hidden or behind other windows, a new nudge now shows as a notification with the line to say, and the coach button in the note gets a dot until you open the coach.
- The coach now opens even if you close the folder picker, and offers to choose a project folder from inside the coach.
- If a new coach shortcut can't be set, the previous one keeps working and the reason is shown.
- Deleting a contact or organization now shows an Undo button for 10 seconds.
- The dictation Accessibility hint, the assistant's name, recording error messages and the onboarding link now say Cue and point to Cue's own release page.
- Cue's data folder in Application Support is now named Cue. Existing data moves there automatically on the first launch, and the old folder name keeps pointing to it.
- Live transcription now connects on slow networks instead of pausing, and when the connection is slow it says so while it keeps retrying.
- Deleted notes can now be brought back with Undo for 10 seconds instead of 5.
- ⌘Q, Quit in the Dock and Quit in the menu bar now quit Cue. If a recording is running, Cue asks first, then stops and saves it before quitting. Closing the window still keeps Cue in the menu bar.
- Automations can be renamed by clicking their name at the top of the page, instead of all showing as Untitled automation.
- Renaming a folder keeps its subfolders inside it, and renaming a subfolder no longer moves it to the top level.
- Cue's download is smaller: the installer drops from 307 MB to about 221 MB, and updates from 312 MB to about 299 MB.
- Deleting a template now asks for confirmation first.
- The Test button on the Markdown export automation now works: it exports your latest note to the chosen folder right away, so you can check the result before turning the automation on.
- Clicking a meeting in the menu bar now opens its note instead of joining and recording right away; a separate Join & record item does that when the meeting has a link.
- What's new can now be opened from the Help menu and the ⌘K menu, and it opens once on its own after Cue updates.

## 0.1.4

### Patch Changes

- Adding action items from the coach's wrap-up works again after a crash, and the coach's edits land in the meeting you're recording.
- While a note is recording, a coach button sits next to Stop in the note header and brings the coach forward, opening it if it is closed.
- The coach keeps its nudges and wrap-up after the app restarts.
- The coach now knows which meeting a chat is about, whether it is still live or has ended, and tells you when you have moved on to a different meeting.
- The coach always opens as a narrow panel at the right edge of the screen, instead of reopening at whatever size it was last stretched to.
- The coach no longer gets stuck treating a recording interrupted by a crash as a live meeting, and always gives the wrap-up of the meeting you just stopped.
- What's new now shows Cue's own release notes for the version you're running.
