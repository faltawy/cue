# Transcript-aware coach design

## Intent

Make the coach more useful with the meeting transcript: answer questions from what was actually said, notice unresolved moments, and let the user correct or identify speakers through natural language. Speaker identity corrections should improve later local recognition when the user has enabled **Remember speakers**.

Also let the coach control Cue's active recording when the user explicitly asks it to stop, pause, or resume. These controls apply to Cue's capture only; they do not control the meeting app.

## Current state

- The coach reads timestamped, speaker-labelled transcript lines through `mcp__meeting__live_transcript`.
- The live coach already detects and triages questions, objections, commitments, numbers, and long monologues. Improve this existing path instead of building a second nudge system.
- Users can change a speaker or transcript text from the transcript UI. Full-speaker assignments already promote eligible local voiceprint candidates for future recognition.
- Voiceprint extraction is controlled by **Remember speakers** (on by default). Embeddings are computed on-device and stored in Keychain; unnamed candidates expire after 45 days. Voiceprints are local-only.
- Coach edits to notes and library records are visible and undoable. Transcript edits do not yet have an equivalent coach edit path.
- Cue has an active capture actor and a stop operation, but no pause/resume state or controls.

## User experience

1. **Grounded transcript answers.** The coach answers questions about the meeting using transcript evidence, labels who said it, and includes a timestamp when useful. It should say when the transcript is unclear or does not contain the answer rather than guessing. When practical, the evidence can focus the app on the cited moment. When the answer needs project-specific details, the coach uses a focused lookup and cites its source; it does not delay an immediate in-call answer for optional context or make broad searches. If the needed context is not readily available, it offers to check after the call.
2. **Useful open-loop nudges.** During a live meeting, build on the current nudge pipeline to catch still-open questions, vague promises, decisions without owners, and commitments without dates. Nudges should be timely, specific to a line in the transcript, and suppressed when the issue is answered, resolved, or not actionable. Preserve existing spend, frequency, and user settings limits.
3. **Conversational speaker naming.** On an explicit request such as “Speaker 2 is Leila,” assign that diarized speaker to the matching person across the current transcript. Resolve names only against the current meeting participants and existing people; ask the user when the speaker or person is ambiguous. Do not create a person or infer identity without direction.
4. **Conversational transcript correction.** On an explicit request, correct a clearly identified misheard phrase in a finalized transcript. Speaker naming may happen during a live meeting because it is stored as a speaker-scoped hint; text corrections wait until finalization because live deltas can replace word IDs. If the requested span or replacement is ambiguous, ask before editing. Preserve timing and unrelated words.
5. **Visible, reversible edits.** Apply transcript changes through a coach tool and app bridge, record them as coach edits, show what changed, and support undo. Tool access must not grant the coach general database or filesystem write access.
6. **Optional local voice memory.** A full-speaker assignment can promote the matching candidate to a voiceprint using the existing pipeline. This only happens when **Remember speakers** is enabled. With it off, transcript corrections still work, no candidate is promoted, and existing voiceprints are not consulted for recognition. Keep existing profiles on-device so the user can re-enable memory later; deleting a source meeting removes its associated profiles through Cue's existing cleanup. Never expose voiceprint vectors to the coach model or send them to a remote service.
7. **Recording controls.** Add a recording status read and explicit stop, pause, and resume actions. Stop uses Cue's normal finalization flow so the meeting transcript and summary can finish. Pause suspends Cue audio capture while keeping the same logical meeting open; resume continues that same meeting, with the paused interval represented as an intentional gap. The coach does not start recordings, discard audio, or control Zoom/Meet/other meeting-app state.

## Boundaries

- No transcript or speaker changes from inference alone; the user must ask for the edit.
- Recording controls run only in response to a clear user command, and only affect the active Cue recording. No automatic stop/pause/resume from transcript content or meeting-end guesses.
- Pause must stop audio capture, not merely silence transcription or hide audio from the transcript. The coach must report the resulting recording state.
- Paused is a distinct capture state: it keeps the current meeting reserved and stoppable, but is not reported as actively recording. Process restart must never auto-resume audio capture; interrupted-session behavior follows Cue's existing recovery path.
- Pause/resume requests against an inactive or finalizing session report its actual state and do not start a new session or alter finalized data.
- Do not modify or delete audio. Transcript corrections affect the text and speaker labels only.
- Do not train persistent identity from a partial or word-scoped assignment; use a full diarized-speaker assignment, matching the current UI behavior.
- Do not promise perfect identification. Voice matching remains confidence-gated and only applies where diarization and participant data support it.
- Existing general-purpose meeting tools and read-only constraints remain intact; new mutations are narrow, explicit transcript operations.

## Implementation direction

- Extend `apps/coach/src/meeting-server.ts` with narrowly scoped transcript-edit tools and clear descriptions of when each may be used.
- Add a narrow recording-control path from the coach app bridge into Cue's listener. Extend listener actor state transitions to pause and resume capture in the same session; preserve correct finalization on stop and mark the audio/transcript gap while paused.
- Add authenticated app-bridge endpoints and plugin-side operations for transcript word corrections and speaker assignments. Validate the active session, transcript, word IDs/speaker coordinates, person identity, and expected current values before writing.
- Represent transcript changes as undoable coach edits, following the existing edit history patterns in `plugins/coach/src/edits.rs` and `plugins/coach/src/bridge.rs`.
- Reuse the existing `promote_voiceprint_candidates` path for explicitly assigned full speakers; keep **Remember speakers** as the gate for candidate extraction and long-term recognition.
- Pass the **Remember speakers** setting into known-speaker matching and promotion so disabling it also disables use of already stored local exemplars without deleting them.
- Refine the existing proactive detection/triage prompt for unresolved questions and commitments, including whether later transcript lines resolve them. Keep current throttling and spend caps.
- Update coach instructions so transcript answers stay evidence-based, tool use is explicit, and ambiguous identities/spans trigger a clarification question.

## Acceptance criteria

- A transcript question is answered from the active meeting transcript with an accurate speaker and timestamp when the evidence is available; missing or uncertain evidence is stated plainly.
- A live unresolved question or vague commitment can produce one timely, actionable nudge; answered/resolved moments do not produce duplicate nudges.
- An explicit speaker-name request changes the intended full speaker assignment across the current transcript. Ambiguous names or speakers cause a clarification instead of a write.
- An explicit correction changes only the requested transcript span and preserves its timing and unrelated content.
- A direct stop request finalizes the active Cue recording; a pause request suspends capture without ending the meeting; resume continues that same meeting. No control touches the meeting application or starts/discards a recording.
- Paused state is visible to the coach and app, does not allow a second recording to start, and does not auto-resume after Cue restarts. Its interval is distinguishable from a transcription-provider outage.
- The user can see and undo each coach transcript edit; undo restores the prior transcript state without overwriting later edits.
- Full-speaker assignment promotes a local voiceprint only when **Remember speakers** is on. With it off, no new voiceprint is retained. Voiceprint vectors never enter model prompts or network requests.
- With **Remember speakers** off, pre-existing exemplars are not used for recognition and are not deleted; deleting their source meeting still removes those profiles.
- Claude and Codex coach providers behave consistently, and existing coach transcript reads and meeting edits continue to work.

## Builder calls

- This is one coach reliability improvement with transcript and recording-control capabilities. Keep transcript grounded answers and open-loop nudges in the existing coach paths; implement narrow controls through app-owned APIs.
- The transcript correction tool should target stable word IDs or diarized speaker coordinates, not fuzzy free-text offsets.
- Use the existing per-meeting undo mechanism where possible; if transcript edits need a distinct history kind, it must still integrate with the same user-facing undo action.
- Keep UI changes minimal: the coach reports the edit and exposes the established undo affordance rather than adding a separate transcript editor.
- Actor lifetime and stream restart mechanics are implementation choices as long as the same meeting and transcript continue, no audio is captured while paused, and no pause gap is mistaken for a transcription outage.
- Pause is an in-process state. After a crash/restart, rely on existing interrupted-capture recovery and never resume capture without a fresh user action.
