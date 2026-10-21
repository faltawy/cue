# Notes, folders and tags

Every meeting is a note, and you can also write notes without recording. This page shows how to find notes, write in them, sort them into folders and tags, lock them, and delete them.

## Home

When no note or destination is open, Home shows the next calendar meeting and a recording action. If the event has a meeting link, **Join & record** opens it and starts recording in the event's note; without a link, **Record this event** starts recording against the event. With no upcoming event, **Start recording** makes a new note. Home also links to recent notes and open follow-ups when available. The timeline and its filters remain in the sidebar.

## The note list

The sidebar lists your notes and calendar events by day: Today, Yesterday, Tomorrow, then "3 days ago", "next week" and so on. A line marks the current time. The list shows items up to the end of tomorrow. Click **Open calendar** at the top to see later ones.

Above the list:

- **Hide sidebar** or **Show sidebar** (⌘\\). When the sidebar is hidden, a dot tells you a meeting is coming up.
- **Search** (⌘K)
- **New note** (⌘N)
- **Sort notes**: Group by **Date** or **Folder**, and show **Newest** or **Oldest** first.

Each row shows the title and time. It can also show the folder and tags; turn these on in **Settings → Appearance → Notes list**. A locked note shows a lock. A note that is recording shows a red dot and a stop button.

In the list you can:

- Click a note to open it, or double-click to open it in its own window.
- Click an event to open its note. Cue makes the note if there isn't one yet.
- Select several notes with ⌘-click or ⇧-click, or press ⌘A for all. Press Delete to delete them.
- Drag a note into another note's text to link to it.

Right-click a note for **Open in New Window**, **Show in Finder**, **Lock Note** and **Delete Note**. Right-click an event to delete it, or all events in a repeating series. Right-click empty space and choose **Show Deleted Events** to see events you deleted.

## How do I find a note?

Press ⌘K and type. Cue searches:

- The text of your notes: memos, summaries and transcripts. Each result shows the matching passage with your words highlighted.
- Note titles, people (by name, email or job title), actions such as **New note**, and pages such as Settings.

Arabic matches with or without diacritics. Locked notes are found by title only.

With nothing typed, ⌘K shows recent notes, **New note**, **Record a meeting**, and pages to open: Folders, Calendar, Contacts, Templates, Automations, Settings and **What's new**.

Use ↑ and ↓ to move, Return to open, and Esc to close.

To find text inside an open note, press ⌘F. Click **Replace** in the find bar to replace text.

## Inside a note

The note header has:

- The folder picker
- **Record**, **Join & record** or **Stop** (see [Recording](recording.md))
- The coach button, while recording
- The **⋯** menu

Under the header are the tabs **Summary**, **Memos** and **Transcript**, once a note has more than one. Switch tabs with ⌥⌘← and ⌥⌘→. The first line of the note is its title. Cue suggests a title after the meeting. [What's in a note](recording.md#whats-in-a-note) explains the tabs.

### Transcript turns

Each speaker turn starts with its speaker and a timestamp. If audio is available, click the timestamp to seek and play from the beginning of that turn. Word-level seeking still works by clicking a word. When audio is unavailable, the timestamp remains visible as a reading aid.

### Writing

- Type / for a menu: Text, Heading 1 to 3, Bullet List, Numbered List, Task List, Quote, Code Block, Divider.
- Markdown shortcuts work too, such as `#`, `-`, `1.`, `[ ]`, `>` at the start of a line, and `**bold**`.
- Select text to make it bold, italic, underlined, struck through, code or highlighted.
- Type @ to mention a note, person, organization or folder.
- Paste or drop images, and drag their edges to resize.

Task List items (`[ ]`) are the note's action items. The coach's wrap-up can add commitments as tasks, and automations can collect them into an export.

### Meeting info

Choose **⋯ → Meeting info** to see the calendar event, its meeting link (**Join**), time, place, description, participants and tags. For a note without an event, you can set the date and add participants here. See [Participants](people.md#participants-on-a-note).

## Tags

Tags help you find related notes.

### How do I tag a note?

1. Open the note and choose **⋯ → Meeting info**.
2. Click **Add tag** and type a tag. Cue suggests tags you already use.
3. Press Return. To remove a tag, click its ×.

Tags can be up to 64 characters. A `#hashtag` in your memos also becomes a tag when Cue writes the summary. The coach can add or remove tags when you ask.

### How do I see notes with a tag?

The sidebar has a **Tags** section with each tag and how many notes have it. Click a tag to show only those notes. Click it again to show all notes. A new note you make while a tag is selected gets that tag.

To show tags on each note in the list, turn on **Tags** in **Settings → Appearance → Notes list**.

## Folders

Folders group related notes. The sidebar has a **Folders** section with your folders, their subfolders, and how many notes each holds.

### How do I make a folder?

- Click **+** (**New folder**) next to **Folders** in the sidebar.
- Or type a new name in a note's folder picker and choose **Create "…"**.

To make a folder inside another, open the folder's menu and choose **New subfolder**.

### How do I put a note in a folder?

Click the folder picker in the note header and choose a folder. To take the note out of the folder, choose the same folder again.

You can also file meetings automatically. In the calendar, click an event from a repeating series, click its folder button, and choose **Auto-add**. Cue then puts future meetings of that series in the folder.

### How do I see only one folder?

Click the folder in the sidebar. Click **All notes** to see everything again. To group the whole list by folder instead, use **Sort notes → Folder**.

When you look at one folder, the sidebar also shows:

- A box where you can describe what the notes in this folder are about.
- Materials, which are files you attach to the folder with the **+** button.

### How do I rename, move or delete a folder?

Open the folder's menu (**⋯** next to it in the sidebar):

- **New subfolder**
- **Rename…** keeps its subfolders inside it.
- **Move to** puts the folder inside another folder, or choose **Top level**.
- **Delete…** asks first. The notes stay in All notes. Cue deletes the folder, its subfolders and their materials.

You can also manage folders in **Settings → Folders**.

## The ⋯ menu

| Item                                                | What it does                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Meeting info                                        | Shows the event, date, participants and tags                                                     |
| Version history                                     | Shows earlier versions of your memos                                                             |
| Start listening, Resume listening or Stop listening | Records into this note                                                                           |
| Re-transcribe                                       | Transcribes the recording again with your current model                                          |
| Upload audio, Upload transcript                     | Fills an empty note from a file ([how](recording.md#make-a-note-from-a-recording-or-transcript)) |
| Export                                              | Saves the note as PDF, TXT, Markdown or Org ([how](recording.md#export-a-note))                  |
| Open in New Window                                  | Opens the note in its own window. Esc closes that window.                                        |
| Always on Top                                       | Keeps this window above other windows                                                            |
| Lock Note or Unlock Note                            | Hides the note behind Touch ID or your password                                                  |
| Delete                                              | Deletes the note                                                                                 |

## Get an older version back

Cue saves earlier versions of your memos while you write. Changes within 10 minutes count as one version, and each note keeps up to 50 versions.

1. Choose **⋯ → Version history**.
2. Find the version you want. The newest is at the top.
3. Click **Restore**. Cue puts that version back in Memos.

## Lock a note

Locking hides a note's content until you use Touch ID or your Mac password.

1. Choose **⋯ → Lock Note**, or right-click the note in the list.
2. Confirm with Touch ID or your password.

To open a locked note, click **View Note** and confirm. It stays open until you lock it again or quit Cue.

- The title still shows in the list and in search.
- The coach sees only the title and can't read or change the note.
- Locking hides the note in Cue. It doesn't encrypt the file on your disk.

You only see this option if your Mac supports Touch ID or password confirmation.

## Delete a note

Choose **⋯ → Delete**, or **Delete Note** when you right-click. Cue deletes the note at once and shows **Undo** for 10 seconds. After that, the note and its recording are gone for good. If you delete several selected notes, Cue asks you first.

Deleting a note made from a calendar event also hides that event. To get the event back, right-click empty space in the list and choose **Show Deleted Events**.

## Calendar

Click **Open calendar** in the sidebar, or choose Calendar in ⌘K, to see a month of events and notes. Use **Today** and the arrows to move around.

Click an event to see its details, click **Join** to open its meeting link, file it into a folder, or click **Open note**. Opening the note doesn't start recording. Use **Record** or **Join & record** in the note for that. Click a note to open it.

To connect a calendar, see [Connect your calendar](setup.md#connect-your-calendar).

## Windows

- ⌘\\ hides or shows the sidebar.
- ⌘=, ⌘- and ⌘0 make text bigger, smaller, or normal again.
- **Open in New Window** and **Always on Top** in the ⋯ menu keep a note next to your meeting.
- Esc or the back arrow leaves Settings, Calendar, Contacts, Folders, Templates and Automations.
