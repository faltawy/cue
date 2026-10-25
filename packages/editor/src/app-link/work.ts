import { AppLinkProvider } from "./provider";

export type WorkProvider =
  | AppLinkProvider.Airtable
  | AppLinkProvider.Asana
  | AppLinkProvider.Calendly
  | AppLinkProvider.Dropbox
  | AppLinkProvider.Loom
  | AppLinkProvider.Miro
  | AppLinkProvider.Trello
  | AppLinkProvider.Zoom;

export enum WorkLinkKind {
  Base = "base",
  Board = "board",
  Card = "card",
  Event = "event",
  File = "file",
  Folder = "folder",
  Meeting = "meeting",
  Project = "project",
  Recording = "recording",
  Share = "share",
  Table = "table",
  Task = "task",
  Video = "video",
  View = "view",
}

export interface WorkAttrs {
  provider: WorkProvider;
  kind: WorkLinkKind;
  url: string;
  workspace?: string;
  resourceId?: string;
  resourceTitle?: string;
}

function getProviderLabel(provider: WorkProvider): string {
  switch (provider) {
    case AppLinkProvider.Airtable:
      return "Airtable";
    case AppLinkProvider.Asana:
      return "Asana";
    case AppLinkProvider.Calendly:
      return "Calendly";
    case AppLinkProvider.Dropbox:
      return "Dropbox";
    case AppLinkProvider.Loom:
      return "Loom";
    case AppLinkProvider.Miro:
      return "Miro";
    case AppLinkProvider.Trello:
      return "Trello";
    case AppLinkProvider.Zoom:
      return "Zoom";
  }
}

function getKindLabel(attrs: WorkAttrs): string {
  switch (attrs.kind) {
    case WorkLinkKind.Base:
      return "Base";
    case WorkLinkKind.Board:
      return attrs.resourceTitle ? `Board: ${attrs.resourceTitle}` : "Board";
    case WorkLinkKind.Card:
      return attrs.resourceTitle ? `Card: ${attrs.resourceTitle}` : "Card";
    case WorkLinkKind.Event:
      return attrs.resourceTitle ? `Event: ${attrs.resourceTitle}` : "Event";
    case WorkLinkKind.File:
      return attrs.resourceTitle ? `File: ${attrs.resourceTitle}` : "File";
    case WorkLinkKind.Folder:
      return "Folder";
    case WorkLinkKind.Meeting:
      return attrs.resourceId ? `Meeting ${attrs.resourceId}` : "Meeting";
    case WorkLinkKind.Project:
      return attrs.resourceId ? `Project ${attrs.resourceId}` : "Project";
    case WorkLinkKind.Recording:
      return "Recording";
    case WorkLinkKind.Share:
      return "Shared view";
    case WorkLinkKind.Table:
      return "Table";
    case WorkLinkKind.Task:
      return attrs.resourceId ? `Task ${attrs.resourceId}` : "Task";
    case WorkLinkKind.Video:
      return "Video";
    case WorkLinkKind.View:
      return "View";
  }
}

export function getWorkDisplayParts(attrs: WorkAttrs): {
  header: string;
  subline: string;
} {
  return {
    header: getProviderLabel(attrs.provider),
    subline: getKindLabel(attrs),
  };
}
