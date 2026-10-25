# The coach

The coach is a narrow panel at the right edge of your screen. It follows the meeting you are recording, answers your questions about it, and suggests what to say next. After the meeting, it writes a wrap-up with commitments, open questions and a follow-up message.

The coach uses the Claude or Codex account you choose in **Settings → AI**. See [AI setup](setup.md#choose-your-ai-provider). New chats use your selection; existing chats keep their original provider.

## How do I open the coach?

- Press ⇧⌘K from any app. Press it again to hide the panel.
- While a note is recording, click the coach button next to **Stop** in the note header.
- In the menu bar menu, choose **Coach**.

The panel stays on top of other windows, also in full-screen apps. Closing it only hides it.

The first time, Cue asks you to choose a coach project. This is a folder the coach may read, such as your notes or documents. You can skip it and choose a folder later from inside the coach, in **Settings → AI → Coach project**, or with **Coach Project…** in the menu bar menu.

### Change the coach shortcut

1. Open **Settings → General**.
2. Under **Coach**, click **Coach shortcut**.
3. Press the new keys. Press Esc to cancel.

If another app already uses those keys, Cue shows why and keeps your old shortcut.

## How do I ask the coach something?

Type in the box at the bottom and press Return. Shift-Return starts a new line. Press ↑ in an empty box to bring back your last question. You can also attach or drop in images.

To dictate, hold the microphone button and speak, then release it. With the button focused, you can hold Space or Return instead. Cue adds the words to your draft for review; it never sends them automatically. Press Esc to cancel. Dictation also cancels if you hide the coach, leave the window, or start a new chat, and each recording stops after one minute.

Coach dictation works while Cue records a meeting and uses your selected microphone, transcription provider, languages and dictionary. It needs microphone permission, but not Accessibility permission or the global dictation shortcut. Cue deletes the temporary recording afterward. It does not mute your meeting: mute the call first if you are asking the coach a private question.

The coach keeps answers short. It gives the answer or the next step first, in a few lines. Ask for more if you need it.

- Suggestions under the box change with the meeting. While you record you see "What did they just ask?". After the meeting you see "Draft a follow-up".
- Some answers end with quick replies, such as "Draft the reply". Click one to send it.
- If a short choice changes the answer, the coach asks you with 2 to 4 options. Pick one, type your own answer, or press Esc to skip.

The coach answers in the language you write in. Catch me up answers, and the lines it suggests you say, are in the language of the meeting. The short headlines on suggestion cards are in English.

When a new meeting starts, the coach starts a new chat about that meeting. If you ask about a meeting other than the one you are in, it tells you.

### Coach keyboard shortcuts

| Keys      | Action                                        |
| --------- | --------------------------------------------- |
| ⌘K        | Actions menu                                  |
| ⌘J        | Catch me up (while recording)                 |
| ⇧⌘O       | New chat                                      |
| ⇧⌘C       | Copy the last answer                          |
| /         | Go to the question box                        |
| Esc or ⌘. | Stop the answer, or skip the coach's question |

When the **New chat** button shows a dot, the chat is long and the coach may forget how it started. Start a new chat.

## Catch me up

While you record, the strip under the header shows the latest line of the transcript. Click the strip to see the full transcript.

Click **Catch me up** (⌘J) to get:

- What people are talking about now
- Anything aimed at you that is still open, with the answer if your project folder has it
- What you have promised, and promises that have no owner or date yet
- One thing to say next
- Your talk time over the last 10 minutes

## Nudges

While you record, the coach reads the transcript and speaks up on its own when something may need you. Each nudge appears in the panel with a label and the time, for example "Question for you · 10:42", followed by a suggestion card.

If the coach panel is hidden or behind other windows, the nudge also shows as a notification with the line to say. Click **Open coach** on it. The coach button in the note shows a dot until you open the coach. You can turn these notifications off with **Coach nudges** in **Settings → Notifications**.

### When does the coach nudge?

| Label                       | When                                                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Question for you            | Someone asks you a question or asks what you think. Small talk such as "How are you?" or "Can you hear me?" doesn't count.  |
| You were mentioned          | Someone says your name. Set **Your name** in **Settings → General** so this works.                                          |
| Commitment                  | Anyone promises something, for example "I'll send it by Friday".                                                            |
| Number mentioned            | Someone says a price, amount, percentage, date or quarter.                                                                  |
| Pushback (from 0.2.0)       | The other side objects to the price or the timing, mentions a tool they already use, needs a decision maker, or has doubts. |
| Long monologue (from 0.2.0) | You have talked for about 90 seconds without a break. The coach suggests a question to give the floor back.                 |

The coach can work with any language supported by the AI provider you chose. It checks the recent transcript in that language, even when Cue's local phrase detectors do not recognize the words. Clear questions, pushback and commitments use a fast local cue path after a pause; less obvious moments go through AI triage on the recent transcript. If that transcript changes while triage is running, Cue discards the outdated result and considers the newer conversation when its pacing limits allow. It stays quiet if the meaning is unclear or there is no useful action to take.

Not every moment becomes a nudge. The coach first checks whether you need help. If you already answered well, it stays quiet. It also limits how often it speaks:

- It waits for a pause in the conversation, up to about 8 seconds.
- It nudges at most once a minute, and at most 4 times in 10 minutes.
- It gives a long-monologue nudge at most every 5 minutes.
- It doesn't nudge while it is answering you.

To stop nudges, turn off **Nudges** in **Settings → AI**. You can still ask the coach questions.

Use **Useful** to vote for a nudge, or **Not useful** followed by a reason (or **No reason**) to vote against it. Cue saves the vote on your Mac and confirms it on the card. These votes prioritize categories when several transcript moments compete for a suggestion; they do not train the AI model or change when Cue interrupts. **Already handled** also prevents another nudge for that same transcript moment. The other reasons currently have the same category-vote effect: **Wrong language** does not set a language preference, and **Poor timing** does not change the pacing limits. Reset feedback from the coach actions menu.

## The suggestion card

Nudges and Catch me up end with a card that has:

- A label: Open question, Pushback, Buying signal, Risk, Vague promise, Over-promise, Giving ground, Talk time, Decision owner or Agenda
- A short headline that says what to do
- **Say** or **Ask** with the exact words, and a button to copy them
- Sometimes a short warning
- The quote and the speaker that started it

Click the quote or timestamp to open that meeting's transcript at the moment. When audio is still available, Cue seeks and plays from there. This works for live nudges, Catch me up and the post-meeting Next time suggestions.

## Talk time

Talk time shows how much of the meeting each person spoke, your longest stretch, and how many questions you asked. Catch me up shows the last 10 minutes. The wrap-up shows the whole meeting.

## After the meeting

When you stop recording, the coach writes a wrap-up in the panel:

- Commitments, with who promised what and by when.
- Open questions that nobody answered.
- A follow-up draft, a short message to the other people, written as you. Click **Copy follow-up** to copy it.
- Talk time for the whole meeting.
- Went well and Next time, with feedback on how you ran the meeting. Each point links to a moment and gives words you could have used.

The wrap-up and the follow-up draft are in the language of the meeting, except the short headlines under Next time, which are in English.

Click **Add as action items** to add every commitment to the note's Memos as a task. Very short meetings show "Too short to wrap up." If the wrap-up fails, click **Try again**.

After the meeting, the suggestions help with the follow-up. You can make it shorter or more formal, or ask what to do first.

## What can the coach do in Cue?

The coach can look things up in Cue whenever it helps:

- Search your past meetings and notes, and read their notes and transcripts
- Look up contacts and organizations
- List your folders, tags, templates and action items

It changes things only when you ask, or after you agree to its suggestion:

- Add text or tasks to the current meeting's Memos, or mark a task done
- Make a note or folder, rename a note, move it to a folder, or change its tags
- Add or update a contact or organization, or add someone to a meeting
- Make or edit a note template

Each change shows in the panel, for example "Action item added", and the note marks it as made by the coach. Click **Undo** on the latest change to reverse it. The coach can't delete anything. When you undo a note, folder or contact the coach made, Cue removes it only if nobody changed it since.

When the coach shows a list of tasks, click **Add to note** on a task to add it to the note.

## What can't the coach see or do?

- It can't see Cue's settings, accounts, connectors, recordings or saved keys.
- It sees only the titles of locked notes.
- It can't read files outside your coach project and knowledge files.
- It can read and search your files, but it can't change them or run commands that change anything.

## Give the coach your files

- Coach project (in **Settings → AI**): A folder the coach can read and search. It names the files it used.
- Knowledge: Extra files and folders the coach reads when they matter. Add them with **Add file…** or **Add folder…**. Cue doesn't send them with every message.
- Folder for a meeting series: For a repeating meeting, you can choose a different folder for that series. Use the folder menu under the question box, or **Choose a folder for this series** in the ⌘K menu. **Use the default folder** switches back.

## Tell the coach about you

In **Settings → AI → Coach instructions**, write what the coach should know about you and how it should answer. For example: "I'm the CTO of Northwind. Prefer short answers. Never promise dates." Your instructions apply from the next chat and come before the coach's own defaults. Cue sends them with every message, so keep them under about 4,000 characters.

## Web access

With **Web access** on in **Settings → AI** (the default), the coach can search the web and read public pages when you ask about a company, person or term from the meeting. It names the pages it used. A web page can't make the coach draft emails, edit notes or change anything.

## Claude connectors

**Settings → AI → Claude connectors** lists the connectors on your Claude account. These connectors work only with Claude; switching to Codex preserves their settings. You add connectors in Claude under Settings → Connectors. The coach uses only the ones you turn **On**.

- At first, the coach can only read through a connector. It can get, list, search and read.
- Turn on **Allow changes** to let the coach use the connector's other actions, and only when you ask.
- Gmail has stricter rules. The coach can search and read mail. With **Allow changes** on, it can also write drafts. It never sends, replies, forwards, deletes, labels or marks mail. You check the draft and send it yourself.

### Tools

In **Settings → AI → Tools** you can add your own tool servers (MCP servers) by address. Cue checks the address and asks for a token, password or header if the server needs one. Cue keeps these secrets in your Mac's Keychain. Like connectors, tools only read unless you turn on **Allow changes**.

If you add a tool named `clients` and allow changes, the wrap-up also shows **Log promises to clients**. It asks the coach to record the meeting's commitments in that tool.

## Cost and limits

The coach uses the account for its provider. The displayed cost is an API-equivalent estimate, not a subscription bill. While you record, the panel header shows an estimate of what the coach used in this meeting, for example "$0.12 this meeting". Hover over it for details.

**Spend limit per meeting** in **Settings → AI** caps nudges, from $0.01 to $100 (default $0.50). When nudges reach it, the header says "Nudges paused" for the rest of the meeting. You can still ask questions. The amount is an estimate. Cue doesn't charge you anything.

If your provider limits your requests, the coach shows "Usage limit reached". Wait a moment or check your plan's usage, then click **Try again**.

## Choose the model

With Claude selected, **Model** in **Settings → AI** can be Sonnet (default), Opus (slower, smarter) or Haiku. Cue uses it for the coach's answers, the wrap-up, summaries and titles. With Claude, nudges always use Sonnet. For Codex, leave the model blank to use its default or enter a model name available to your account; coaching and background requests use that preference. If Cue cannot estimate a model's cost, it pauses automatic coaching after unpriced usage; you can still ask questions.
