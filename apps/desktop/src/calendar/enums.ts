export enum SyncStatus {
  Idle = "idle",
  Scheduled = "scheduled",
  Syncing = "syncing",
}

export enum IgnoredEventKind {
  Events = "events",
  Series = "series",
}

export enum EventMenuView {
  Main = "main",
  Folders = "folders",
  Manage = "manage",
}

export enum SeriesFolderPickerMode {
  Occurrence = "occurrence",
  Rule = "rule",
}
