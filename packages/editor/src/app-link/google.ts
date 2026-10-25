import { AppLinkProvider } from "./provider";

export enum GoogleLinkKind {
  Document = "document",
  File = "file",
  Folder = "folder",
  Form = "form",
  Presentation = "presentation",
  Spreadsheet = "spreadsheet",
}

export interface GoogleAttrs {
  provider: AppLinkProvider.Google;
  kind: GoogleLinkKind;
  url: string;
  resourceId?: string;
}

export function getGoogleDisplayParts(attrs: GoogleAttrs): {
  header: string;
  subline: string;
} {
  switch (attrs.kind) {
    case GoogleLinkKind.Document:
      return { header: "Google Docs", subline: "Document" };
    case GoogleLinkKind.Spreadsheet:
      return { header: "Google Sheets", subline: "Spreadsheet" };
    case GoogleLinkKind.Presentation:
      return { header: "Google Slides", subline: "Presentation" };
    case GoogleLinkKind.Form:
      return { header: "Google Forms", subline: "Form" };
    case GoogleLinkKind.Folder:
      return { header: "Google Drive", subline: "Folder" };
    case GoogleLinkKind.File:
      return { header: "Google Drive", subline: "File" };
  }
}
