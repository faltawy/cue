import { AppLinkProvider } from "./provider";

export enum LinearLinkKind {
  Document = "document",
  Issue = "issue",
  Initiative = "initiative",
  Project = "project",
  Route = "route",
  Team = "team",
  View = "view",
  Workspace = "workspace",
}

export interface LinearAttrs {
  provider: AppLinkProvider.Linear;
  kind: LinearLinkKind;
  url: string;
  workspace?: string;
  resourceTitle?: string;
  resourceId?: string;
}

function getKindLabel(attrs: LinearAttrs): string {
  switch (attrs.kind) {
    case LinearLinkKind.Document:
      return attrs.resourceTitle
        ? `Document: ${attrs.resourceTitle}`
        : "Document";
    case LinearLinkKind.Issue:
      return attrs.resourceId ? `Issue ${attrs.resourceId}` : "Issue";
    case LinearLinkKind.Initiative:
      return attrs.resourceTitle
        ? `Initiative: ${attrs.resourceTitle}`
        : "Initiative";
    case LinearLinkKind.Project:
      return attrs.resourceTitle
        ? `Project: ${attrs.resourceTitle}`
        : "Project";
    case LinearLinkKind.Route:
      return attrs.resourceTitle ? `Route: ${attrs.resourceTitle}` : "Route";
    case LinearLinkKind.Team:
      return attrs.resourceTitle ? `Team: ${attrs.resourceTitle}` : "Team";
    case LinearLinkKind.View:
      return attrs.resourceTitle ? `View: ${attrs.resourceTitle}` : "View";
    case LinearLinkKind.Workspace:
      return "Workspace";
  }
}

export function getLinearDisplayParts(attrs: LinearAttrs): {
  header: string;
  subline: string;
} {
  return {
    header: attrs.workspace ?? "Linear",
    subline: getKindLabel(attrs),
  };
}
