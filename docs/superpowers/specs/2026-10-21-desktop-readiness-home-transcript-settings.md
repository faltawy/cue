# Desktop readiness, home, transcript, and settings

## Intent

Help a new user reach a successful first recording quickly, give returning users a clear place to start, make transcripts easier to scan, and organize settings around user tasks.

## Why

Onboarding currently asks about permissions, calendar, and AI sign-in but does not show transcription readiness. The default workspace is the meeting timeline without a focused dashboard. Transcript speaker turns are grouped and words can seek audio, but turns have no visible timestamps. Settings uses broad “App / AI / Workspace / Advanced” groups that mix setup and day-to-day controls.

## Scope

- Replace the onboarding progression with a guided readiness checklist that distinguishes required capture setup from optional calendar setup and AI/transcription features. Show live completion state for microphone and system audio, AI provider sign-in, and a configured transcription path (local model or service). Explain what is optional and where to finish setup later. Keep a clear path to start recording when AI or calendar setup is skipped; do not imply a transcript or summary will be available until its requirements are met.
- Add an optional “Try a short test recording” flow before finishing setup. It must clearly explain whether audio is processed locally or sent to the selected transcription provider, create an identifiable test note, and offer to delete it after verification. Never start capture automatically.
- Add a home surface when no note or other destination is open. It leads with the next calendar meeting and the correct action: open its join link and start recording when one exists, or start recording against the event when it does not. Then offer recent meetings and unresolved follow-ups if available. Keep the existing timeline, filters, and settings search reachable; this surface must remain useful when no calendar is connected and when the library is empty.
- Improve transcript scanning by making speaker turns visually distinct, showing a timestamp at each turn, and making that timestamp a seek/play action when audio exists. Preserve word-level seek, editing, selection, search highlights, mixed-direction text, and the existing transcript data model. Do not add a separate density mode in this release.
- Reorganize settings into task-oriented groups: setup (AI provider, transcription, permissions), meeting capture (meetings, calendar, notifications), library (folders, contacts, templates, dictionary), workflow (automations, dictation), and appearance/general. Preserve stored setting IDs, deep links, and current destinations while changing navigation labels and grouping.

## Constraints

- Follow the existing Cue design spec and Lingui localization workflow for changed app copy.
- Preserve the local-first data model and current recording consent/disclosure behavior.
- Do not make optional configuration a blocker for note-taking or recording; represent missing capabilities honestly.
- Reuse current timeline, session, transcript seeking, and settings navigation infrastructure where possible.

## Non-goals

- Changing recording, transcription, or summary providers.
- Adding cloud sync or changing where user data is stored.
- Replacing the timeline or introducing a new note database entity for the home surface.
- Adding transcript density controls or redesigning the note editor.

## Success criteria

- A new user can identify what is required to capture audio, what is needed for transcript/summary/coach, and what can be skipped; a short test can be explicitly started and deleted.
- With no destination selected, the home surface offers a useful next action with and without calendar data.
- Each transcript speaker turn has a visible time anchor; clicking it seeks the corresponding audio position when available, while transcript editing and selection continue to work.
- Settings groups match the user tasks above, and existing setting state/deep links continue to open the same controls.
