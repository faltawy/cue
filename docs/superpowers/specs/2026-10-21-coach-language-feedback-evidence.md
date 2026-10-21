# Coach language, feedback, and evidence

## Intent

Make Cue's coach useful across languages, help each person tune its live nudges, and make every coaching suggestion easy to verify against the meeting.

## Why

Live nudge candidate detection currently relies on English and Arabic word lists before model triage. The coach already includes the triggering quote, speaker, and timestamp, but the timestamp is not an action. Users also have no direct way to tell Cue when an automatic nudge was useful or distracting.

## Scope

- Support live nudges, catch-up answers, wrap-ups, and follow-up drafts in any language the selected Claude or Codex model can handle. Do not maintain a fixed supported-language allowlist. Candidate detection must no longer depend on English/Arabic-only lexical matches: inspect a bounded window of at most 90 seconds on the existing 15-second triage cadence, including windows without a lexical hit, and combine language-neutral cues with model triage. The model returns a nudge only when it identifies a clear, actionable moment; no numeric self-reported confidence score is used. Preserve existing quiet periods, nudge frequency limits, and per-meeting spend cap. If the model cannot confidently interpret a moment or its language, remain quiet.
- Add useful/not-useful feedback to automatic nudges. “Not useful” may include optional reasons such as already handled, poor timing, irrelevant, or wrong language. Persist feedback locally as per-category preference signals: positive feedback raises that category's future priority, negative feedback lowers it, and “already handled” suppresses repeat nudges for that moment. Do not send feedback to Cue or train a shared model. Provide a way to reset learned preferences and retain the global nudge on/off control.
- Make evidence moments clickable in live nudges, catch-up cards, and post-meeting coaching. Selecting a moment opens its meeting and seeks to the corresponding transcript/audio timestamp when available; with no retained audio, it still opens the transcript at that moment. The target meeting and timestamp must be explicit in the cross-window event.
- The text generated for a user to say and post-meeting coaching use the meeting's dominant language; direct answers follow the user's language. Short tag names are interface labels, not constraints on the model's language. The separate coach panel's feedback controls remain in English; its generated coaching content follows the meeting or user's language as specified above.

## Privacy and safety constraints

- Transcript processing continues through the user's configured provider, consistent with current settings and privacy documentation.
- Feedback and derived per-user preferences stay on the Mac. No analytics, remote feedback collection, or model training is added.
- Keep user confirmation requirements for coach-initiated edits and existing coach spend/interrupt limits.
- Clickable evidence must never seek to a different meeting than the one that produced it.

## Non-goals

- Supporting languages beyond the capabilities of the configured provider.
- Sending feedback to Cue, shared personalization, or automatic training.
- Automatically speaking into the meeting or applying changes without user confirmation.

## Success criteria

- A conversation in a language outside English and Arabic can trigger a relevant live nudge, and the suggested line is in the meeting's language, without exceeding current rate or spend limits.
- Feedback changes future nudge behavior locally and survives app restart; clearing learned preferences restores default behavior.
- Clicking evidence opens the matching meeting and seeks to the cited moment, or locates the transcript moment when audio is unavailable.
- Claude and Codex follow the same observable language, feedback, and evidence behavior.
