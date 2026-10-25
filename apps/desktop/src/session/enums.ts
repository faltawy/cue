export enum FileFormat {
  Pdf = "pdf",
  Txt = "txt",
  Md = "md",
  Org = "org",
}

export enum RemoteMeetingType {
  Zoom = "zoom",
  GoogleMeet = "google-meet",
  Webex = "webex",
  Teams = "teams",
  CalCom = "cal-com",
  XCall = "x-call",
}

export enum AttachmentAvailability {
  Present = "present",
  Absent = "absent",
}

export enum TitleInputVariant {
  Title = "title",
  Breadcrumb = "breadcrumb",
}

export enum NoteHeaderSize {
  Tray = "tray",
  Standalone = "standalone",
}

export enum TabNavigationDirection {
  Previous = "previous",
  Next = "next",
}

export enum PastNoteRelationship {
  SameSeries = "same_series",
  MatchingTitle = "matching_title",
  SharedParticipants = "shared_participants",
}

export enum SessionConflictField {
  Body = "body",
  Title = "title",
}

export enum ProposalKind {
  SummaryReplace = "summary_replace",
  MemoReplace = "memo_replace",
}

export enum ProposalStatus {
  Pending = "pending",
  Applied = "applied",
  Declined = "declined",
}

export enum ProposalResolution {
  Applied = "applied",
  Declined = "declined",
}

export enum MoveSessionContentsStatus {
  Moved = "moved",
  Error = "error",
  NothingToMove = "nothing_to_move",
}

export enum NoteSearchAction {
  ToggleVisible = "toggle_visible",
  OpenVisible = "open_visible",
  Close = "close",
  SetQuery = "set_query",
  SetReplaceQuery = "set_replace_query",
  ToggleCaseSensitive = "toggle_case_sensitive",
  ToggleWholeWord = "toggle_whole_word",
  ToggleReplace = "toggle_replace",
  SetMatches = "set_matches",
  Navigate = "navigate",
}

export enum TranscriptScreenKind {
  RunningBatch = "running_batch",
  BatchFallback = "batch_fallback",
  Listening = "listening",
  Empty = "empty",
  Ready = "ready",
}
