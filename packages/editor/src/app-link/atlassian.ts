import { AppLinkProvider } from "./provider";

export enum AtlassianLinkKind {
  ConfluencePage = "confluence_page",
  ConfluenceSpace = "confluence_space",
  JiraIssue = "jira_issue",
}

export interface AtlassianAttrs {
  provider: AppLinkProvider.Atlassian;
  kind: AtlassianLinkKind;
  url: string;
  workspace?: string;
  resourceId?: string;
  resourceTitle?: string;
}

export function getAtlassianDisplayParts(attrs: AtlassianAttrs): {
  header: string;
  subline: string;
} {
  switch (attrs.kind) {
    case AtlassianLinkKind.JiraIssue:
      return {
        header: attrs.workspace ?? "Jira",
        subline: attrs.resourceId ? `Jira ${attrs.resourceId}` : "Jira issue",
      };
    case AtlassianLinkKind.ConfluencePage:
      return {
        header: attrs.workspace ?? "Confluence",
        subline: attrs.resourceTitle
          ? `Confluence: ${attrs.resourceTitle}`
          : "Confluence page",
      };
    case AtlassianLinkKind.ConfluenceSpace:
      return {
        header: attrs.workspace ?? "Confluence",
        subline: attrs.resourceId
          ? `Confluence space ${attrs.resourceId}`
          : "Confluence space",
      };
  }
}
