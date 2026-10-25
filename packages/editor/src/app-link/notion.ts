import { AppLinkProvider } from "./provider";

export enum NotionLinkKind {
  Database = "database",
  Page = "page",
  Workspace = "workspace",
}

export interface NotionAttrs {
  provider: AppLinkProvider.Notion;
  kind: NotionLinkKind;
  url: string;
  workspace?: string;
  resourceTitle?: string;
  resourceId?: string;
}

export function getNotionDisplayParts(attrs: NotionAttrs): {
  header: string;
  subline: string;
} {
  if (attrs.kind === NotionLinkKind.Workspace) {
    return {
      header: attrs.workspace ?? "Notion",
      subline: "Workspace",
    };
  }

  const label = attrs.kind === NotionLinkKind.Database ? "Database" : "Page";
  return {
    header: attrs.workspace ?? "Notion",
    subline: attrs.resourceTitle ? `${label}: ${attrs.resourceTitle}` : label,
  };
}
