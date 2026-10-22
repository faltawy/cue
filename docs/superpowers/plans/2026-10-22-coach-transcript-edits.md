# Coach Transcript Edits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the coach assign a speaker or correct finalized transcript wording on explicit request, with visible, reversible edits and optional local voice memory.

**Architecture:** Add narrow speaker-assignment and word-correction operations to the authenticated coach bridge and its existing undo log. Expose only stable transcript word/speaker references to the coach; resolve a target person against existing meeting participants. Reuse the local voiceprint pipeline while honoring the **Remember speakers** setting for extraction, matching, and promotion.

**Tech Stack:** Bun, TypeScript, Rust, Axum, SQLx, SQLite, Tauri, `bun:test`, Rust unit/integration tests.

**Spec:** [2026-10-22-transcript-aware-coach-design.md](../specs/2026-10-22-transcript-aware-coach-design.md)

## Global Constraints

- “No transcript or speaker changes from inference alone; the user must ask for the edit.”
- “If the requested span or replacement is ambiguous, ask before editing.”
- “Tool access must not grant the coach general database or filesystem write access.”
- “The user can see and undo each coach transcript edit; undo restores the prior transcript state without overwriting later edits.”
- “Never expose voiceprint vectors to the coach model or send them to a remote service.”

## Review Focus

- A speaker/person name matching multiple contacts must not write; test with two matching people and a positive control for the unique participant.
- A correction containing stale or replaced word IDs must fail without modifying transcript words; test stale IDs alongside valid seeded words in the same transcript.
- Undo after a later user edit must refuse to overwrite it; test expected post-image and changed-current-image against the same transcript row.
- **Remember speakers** off must disable both lookup and promotion while preserving local exemplar data; test on/off behavior against seeded active exemplars.
- A request naming an absent or non-participant person must not create a contact; test the rejection with a seeded valid meeting participant as the positive control.

---

### Task 1: Provide stable edit context from transcript tools

**Files:**

- Modify: `apps/coach/src/transcript.ts`
- Modify: `apps/coach/src/transcript.test.ts`
- Modify: `apps/coach/src/meeting-server.ts`

**Interfaces:**

- Consumes: `Word.id`, `Word.channel`, optional `Word.speaker_index`, and the current `LiveTranscript`.
- Produces: read-only `transcript_edit_context()` for finalized transcript spans, returning timestamped lines with `word_ids`, `channel`, and `speaker_index`; the ordinary `live_transcript` remains the human-readable view.

- [ ] **Step 1: Write a failing test** with seeded base words plus a live replacement delta proving edit context contains only current word IDs, retains the correct speaker coordinate, and refuses to expose editable context for a live transcript.
- [ ] **Step 2: Run `cd apps/coach && bun test src/transcript.test.ts src/meeting-server.test.ts` and confirm the new test fails for missing edit context.**
- [ ] **Step 3: Add `TranscriptEditLine` and `readTranscriptEditContext(db, sessionId)` in `transcript.ts`; return current finalized word IDs and speaker coordinates, or a typed not-finalized result. Register the read-only `transcript_edit_context` tool.**
- [ ] **Step 4: Run the focused tests.**

Expected: PASS; existing live transcript output remains unchanged.

- [ ] **Step 5: Commit** with `feat: expose stable transcript edit context`.

### Task 2: Add transactional, undoable transcript edits to the coach bridge

**Files:**

- Modify: `plugins/coach/src/edits.rs`
- Modify: `plugins/coach/src/bridge.rs`
- Modify: `plugins/coach/src/lib.rs`
- Test: `plugins/coach/src/edits.rs`
- Test: `plugins/coach/src/bridge.rs`

**Interfaces:**

- Consumes: authenticated `POST /meeting/{session_id}/transcript/speakers` with `{ channel, speaker_index, human_id }` and `POST /meeting/{session_id}/transcript/corrections` with `{ word_ids, expected_text, replacement }`.
- Produces: `CoachEdit` kinds `AssignSpeaker` and `CorrectTranscript`; each is added to the existing per-meeting undo log and uses compare-before-write/compare-before-undo checks.

- [ ] **Step 1: Add failing edit tests** for one successful speaker assignment, one exact word correction preserving IDs/timings, a wrong-meeting request, stale expected text, and undo refusal after a later change.
- [ ] **Step 2: Run `cargo test -p tauri-plugin-coach edits::` and the focused bridge tests; confirm the new cases fail before implementation.**
- [ ] **Step 3: Add transactional methods `Edits::assign_transcript_speaker(...)` and `Edits::correct_transcript_words(...)`; validate that the requested session is the coach's meeting, validate IDs/coordinates, participant identity, and expected current values before recording before/after images. Permit finalized transcript corrections after the meeting ends. Extend undo to restore only when the current image still matches the coach edit.**
- [ ] **Step 4: Add the two authenticated Axum routes and map `EditError` to existing bridge responses. Ensure no endpoint accepts raw SQL, arbitrary paths, or unscoped human IDs.**
- [ ] **Step 5: Run `cargo test -p tauri-plugin-coach`.**

Expected: PASS, including existing undo ordering and changed-since protections.

- [ ] **Step 6: Commit** with `feat: add undoable coach transcript edits`.

### Task 3: Add explicit coach tools for speaker names and text corrections

**Files:**

- Modify: `apps/coach/src/app-bridge.ts`
- Modify: `apps/coach/src/app-bridge.test.ts`
- Modify: `apps/coach/src/meeting-server.ts`
- Modify: `apps/coach/src/session.ts`
- Modify: `apps/coach/src/turn-events.ts`
- Test: `apps/coach/src/meeting-server.test.ts`
- Test: `apps/coach/src/turn-events.test.ts`

**Interfaces:**

- Consumes: the bridge routes from Task 2 and stable references from Task 1.
- Produces: `assign_speaker({ channel, speaker_index, person_name })` and `correct_transcript({ word_ids, expected_text, replacement })`. Both tools require explicit user instruction; speaker assignment resolves only a unique existing meeting participant and correction requires a finalized transcript.

- [ ] **Step 1: Write failing tests** for unique versus ambiguous person resolution, explicit-only tool descriptions, correction on an ended transcript, and coach edit events shown with the right human-readable labels.
- [ ] **Step 2: Run `cd apps/coach && bun test src/app-bridge.test.ts src/meeting-server.test.ts src/turn-events.test.ts` and confirm failure.**
- [ ] **Step 3: Add typed `AppBridge` methods and tool schemas; call `meeting_info`/edit context as needed and return errors as tool failures without retrying a write with guessed identifiers.**
- [ ] **Step 4: Update `COACH_PROMPT`/`NOTES_PROMPT` so the coach edits only when asked, clarifies ambiguous targets, explains the edit briefly, and points to the established undo action.**
- [ ] **Step 5: Add turn-event labels for both new tools and run focused tests.**

Expected: PASS for app bridge, meeting tool, and coach timeline behavior.

- [ ] **Step 6: Commit** with `feat: let coach correct transcript speakers and words`.

### Task 4: Honor the speaker-memory setting for matching and promotion

**Files:**

- Modify: `apps/desktop/src/stt/useStartListening.ts`
- Modify: `crates/listener-core/src/actors/session/types.rs`
- Modify: `plugins/transcription/src/listener2/ext.rs`
- Modify: `plugins/transcription/src/voiceprint.rs`
- Test: `plugins/transcription/src/voiceprint.rs`
- Test: `apps/desktop/src/stt/useStartListening.test.ts`

**Interfaces:**

- Consumes: the saved `remember_speakers` setting and a full-speaker assignment.
- Produces: known-speaker matching and candidate promotion only when the setting is enabled; disabled mode leaves existing local Keychain exemplars intact and unused.

- [ ] **Step 1: Add failing tests** proving an existing matching exemplar is used when enabled, ignored when disabled, and not deleted by disabling; retain a positive enabled control against the same seeded exemplar.
- [ ] **Step 2: Run the focused frontend and Rust tests and verify failure.**
- [ ] **Step 3: Pass `remember_speakers` through session startup/configuration to `known_speakers_for_session`; gate matching and promotion while preserving local stored data.**
- [ ] **Step 4: Run `cd apps/coach && bun run typecheck && bun test`; run `cargo test -p tauri-plugin-transcription voiceprint::` and `cargo check --locked -p desktop --features dev`.**

Expected: PASS; no biometric data enters coach prompts or network requests.

- [ ] **Step 5: Commit** with `fix: honor remember speakers when matching voiceprints`.
