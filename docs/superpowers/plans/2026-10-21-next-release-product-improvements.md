# Next Release Product Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the seven approved coach and desktop improvements with matching user documentation.

**Architecture:** Extend the existing coach sidecar for multilingual candidate triage, local feedback learning, and evidence navigation; extend the current Tauri desktop flows for setup readiness, Home, transcript scanning, and settings navigation. Update existing guides to describe the shipped behavior and privacy boundaries.

**Tech Stack:** Bun, TypeScript, React, Tauri 2, Rust, Lingui, Vitest, Cargo.

**Spec:** `docs/superpowers/specs/2026-10-21-coach-language-feedback-evidence.md` and `docs/superpowers/specs/2026-10-21-desktop-readiness-home-transcript-settings.md`

## Global Constraints

- Coach supports languages the configured model can handle; no fixed language allowlist.
- Inspect at most 90 seconds every 15 seconds; preserve existing quiet periods, rate limits, and per-meeting spend cap.
- Keep feedback and learned preferences local; do not add analytics or shared training.
- Evidence navigation carries an explicit session ID and timestamp and never crosses to another meeting.
- Keep recording consent, local-first storage, existing transcript schema, setting IDs, and deep links intact.
- Optional onboarding setup must not block recording; never start a test recording automatically.
- Follow Cue design conventions, Lingui extraction/compilation, and project TDD/testing instructions.

## Review Focus

- Empty or unsupported-language transcript windows must not create noisy nudges; exercise a non-English positive control and an unclear-language quiet case in coach triage tests.
- Feedback for one coach category must not weaken unrelated categories; exercise both seeded categories and restart persistence.
- Evidence click events must route to the exact session and timestamp; exercise a second session as a negative control.
- Onboarding must distinguish capture readiness from optional AI/calendar readiness; test skipped configuration still permits recording and test recording requires an explicit action.
- Calendar absence, empty libraries, missing audio, RTL transcripts, active editing/selection, and settings deep links must remain functional.

---

### Task 1: Multilingual live coach and local feedback

**Files:** `apps/coach/src/detect.ts`, `triage.ts`, `proactive.ts`, `chat-store.ts`, relevant `*.test.ts` files; coach guide and privacy guide.

**Interfaces:** Keep existing detection/triage pipeline interfaces where possible. Add a persisted per-category preference signal to the local chat/settings store and consume it when ranking or suppressing candidate nudges.

- [ ] Add tests proving an unsupported-by-lexicon language is triaged on the 15-second cadence and that an unclear candidate produces no nudge. Include positive controls on seeded transcript windows.
- [ ] Run the targeted coach tests and observe the expected failures.
- [ ] Implement language-neutral bounded-window triage and actionable-only prompt/output validation without changing rate, quiet, or spend limits.
- [ ] Add tests for useful/not-useful category preference updates, “already handled” moment suppression, persistence after reload, and reset while another category remains positive.
- [ ] Implement local feedback persistence and category weighting; do not send feedback to providers.
- [ ] Update `docs/coach.md` and `docs/privacy.md` to explain language behavior, feedback storage/reset, and processing boundaries.
- [ ] Run `cd apps/coach && bun test` and `bun run typecheck`.

### Task 2: Evidence navigation and feedback controls

**Files:** `apps/coach/src/protocol.ts`, coach UI components, coach bridge routes, `plugins/coach/src` event/bridge code, desktop coach event handling and session navigation, related tests; `docs/coach.md`.

**Interfaces:** Evidence target is `{ sessionId: string; timestampMs: number }`; cross-window routing carries both values explicitly. Reuse existing session open and transcript/audio seek mechanisms.

- [ ] Add failing tests for evidence selection routing to the supplied session and timestamp, including an unrelated session negative control, and feedback controls using the current UI locale/fallback.
- [ ] Run those tests and observe failures for missing actions/route behavior.
- [ ] Implement clickable evidence in live nudges, catch-up, and wrap-up UI; show useful/not-useful feedback and optional reason selection.
- [ ] Implement explicit cross-window evidence event and route it into the existing session seek flow; with no audio, open the transcript at the target moment.
- [ ] Run coach tests/typecheck, desktop targeted tests, and `cargo test -p tauri-plugin-coach` if the plugin changes.
- [ ] Update coach guide with evidence navigation and feedback behavior.

### Task 3: Guided onboarding readiness and test recording

**Files:** `apps/desktop/src/onboarding/config.tsx`, onboarding components and tests, permission/transcription readiness queries as appropriate; `docs/setup.md`, `docs/recording.md`, `docs/privacy.md`.

**Interfaces:** Read readiness from existing permission, provider-auth, and transcription configuration sources. Test recording must use existing capture/session creation and expose an identifiable test note with an explicit delete action.

- [ ] Add tests for microphone/system-audio readiness, optional calendar, provider and transcription readiness, skip-to-record behavior, and test-recording explicit start/delete.
- [ ] Run onboarding tests and observe failures.
- [ ] Implement the readiness checklist with live states and honest capability labels; do not block recording for optional AI/calendar setup.
- [ ] Implement the optional, user-started short recording and test-note deletion using existing session APIs and clearly identify local vs provider processing.
- [ ] Run onboarding targeted tests and desktop typecheck.
- [ ] Update setup/recording/privacy guides with the checklist, optional setup, and test audio processing details.

### Task 4: Home dashboard

**Files:** `apps/desktop/src/main/empty.tsx`, its data/query helpers and tests; `docs/notes.md` or `docs/setup.md` where the current home behavior is explained.

**Interfaces:** Extend the existing empty/home surface and reuse calendar, session, timeline, and follow-up queries. Preserve current navigation destinations and filters.

- [ ] Add tests for next meeting with join URL, next meeting without join URL, no calendar, empty library, recent notes, and unresolved follow-ups where data exists.
- [ ] Run Home tests and observe failures.
- [ ] Implement the home layout and event actions: open join link and associate recording when present; otherwise start recording against the event.
- [ ] Run Home tests and desktop typecheck.
- [ ] Update the relevant existing guide to explain the Home entry points.

### Task 5: Scannable transcript turns

**Files:** `apps/desktop/src/session/components/note-input/transcript/renderer/segment.tsx`, segment header/rendering tests and locale catalogs if copy is added; `docs/notes.md`.

**Interfaces:** Add turn-level timestamp using existing segment start time and existing `seekAndPlay` callback. Preserve word-level seek and editor selection/event handling.

- [ ] Add tests that turn timestamps render and seek to the segment start while word seeking and text editing/selection remain intact; include RTL transcript text and missing-audio behavior.
- [ ] Run transcript tests and observe the missing timestamp/action.
- [ ] Implement visible speaker-turn hierarchy and timestamp seek action without changing transcript data.
- [ ] Run transcript targeted tests and desktop typecheck.
- [ ] Update notes guide with turn timestamps and seeking.

### Task 6: Task-oriented settings navigation

**Files:** `apps/desktop/src/sidebar/settings-nav-groups.ts`, settings navigation tests and all relevant locale catalogs; `docs/settings.md`.

**Interfaces:** Retain every existing page ID and destination; only regroup and relabel navigation into Setup, Meeting capture, Library, Workflow, and Appearance & general.

- [ ] Add tests for the five groupings, search reachability, and unchanged destination IDs/deep links.
- [ ] Run settings navigation tests and observe failures.
- [ ] Implement the new group names and assignments without changing persisted IDs.
- [ ] Run desktop tests/typecheck and Lingui extraction/compilation/check.
- [ ] Update the settings guide to mirror the new task groups and page destinations.

### Task 7: Integrated verification and release docs

**Files:** touched files from Tasks 1–6, `docs/RELEASING.md` and any existing release notes/changelog entry required by repository conventions.

- [ ] Run all checks required by root `AGENTS.md` for coach, desktop/shared UI, and changed Rust plugin crates.
- [ ] Inspect `git diff --stat` after format/codegen and remove only task-introduced unrelated formatting churn.
- [ ] Verify documentation matches final UI labels and privacy behavior; verify release documentation lists all seven user-facing improvements.
- [ ] Run a fresh whole-branch code review against both specs and the Review Focus list; fix Critical/Important findings with RED→GREEN tests.

## Self-review

- Spec coverage: coach language triage, local feedback/reset, evidence navigation, onboarding readiness/test recording, Home, transcript timestamps, and task-oriented settings each have a task. Both specs' privacy, consent, compatibility, and locale constraints appear in Global Constraints and task coverage.
- Step scan: every subsystem task has a concrete failing-test step, expected behavior, implementation, and appropriate focused verification; final task provides cross-subsystem checks and release-doc verification.
- Interface consistency: evidence uses one `sessionId` + `timestampMs` target; onboarding uses existing readiness sources and session APIs; transcript timestamps reuse segment time and `seekAndPlay`; settings preserve existing IDs.
- Review focus: all five likely failure classes are mapped to explicit tests in the owning tasks.
- Proportion: tasks describe boundaries and test outcomes, avoiding implementation transcripts.
