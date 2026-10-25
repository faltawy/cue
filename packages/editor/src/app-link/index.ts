import { getAtlassianDisplayParts, type AtlassianAttrs } from "./atlassian";
import { getDiscordDisplayParts, type DiscordAttrs } from "./discord";
import { getFigmaDisplayParts, type FigmaAttrs } from "./figma";
import { getGitHubDisplayParts, type GitHubAttrs } from "./github";
import { getGoogleDisplayParts, type GoogleAttrs } from "./google";
import { getLinearDisplayParts, type LinearAttrs } from "./linear";
import { getNotionDisplayParts, type NotionAttrs } from "./notion";
import { AppLinkProvider } from "./provider";
import { getSlackDisplayParts, type SlackAttrs } from "./slack";
import { getWorkDisplayParts, type WorkAttrs } from "./work";

export type { GitHubAttrs } from "./github";
export { GitHubLinkKind, GitHubLinkKind as AppLinkKind } from "./github";
export type { SlackAttrs } from "./slack";
export type { DiscordAttrs } from "./discord";
export type { LinearAttrs } from "./linear";
export type { NotionAttrs } from "./notion";
export type { GoogleAttrs } from "./google";
export type { FigmaAttrs } from "./figma";
export type { AtlassianAttrs } from "./atlassian";
export type { WorkAttrs } from "./work";

export type AppLinkAttrs =
  | GitHubAttrs
  | SlackAttrs
  | DiscordAttrs
  | LinearAttrs
  | NotionAttrs
  | GoogleAttrs
  | FigmaAttrs
  | AtlassianAttrs
  | WorkAttrs;

export function getAppLinkDisplayParts(attrs: AppLinkAttrs): {
  header: string;
  subline: string;
} {
  switch (attrs.provider) {
    case AppLinkProvider.Github:
      return getGitHubDisplayParts(attrs);
    case AppLinkProvider.Slack:
      return getSlackDisplayParts(attrs);
    case AppLinkProvider.Discord:
      return getDiscordDisplayParts(attrs);
    case AppLinkProvider.Linear:
      return getLinearDisplayParts(attrs);
    case AppLinkProvider.Notion:
      return getNotionDisplayParts(attrs);
    case AppLinkProvider.Google:
      return getGoogleDisplayParts(attrs);
    case AppLinkProvider.Figma:
      return getFigmaDisplayParts(attrs);
    case AppLinkProvider.Atlassian:
      return getAtlassianDisplayParts(attrs);
    case AppLinkProvider.Airtable:
    case AppLinkProvider.Asana:
    case AppLinkProvider.Calendly:
    case AppLinkProvider.Dropbox:
    case AppLinkProvider.Loom:
    case AppLinkProvider.Miro:
    case AppLinkProvider.Trello:
    case AppLinkProvider.Zoom:
      return getWorkDisplayParts(attrs);
  }
}

export function getAppLinkLabel(attrs: AppLinkAttrs): string {
  const { header, subline } = getAppLinkDisplayParts(attrs);
  return `${header} ${subline}`;
}

export { SlackLinkKind } from "./slack";

export { DiscordLinkKind } from "./discord";

export { LinearLinkKind } from "./linear";

export { NotionLinkKind } from "./notion";

export { GoogleLinkKind } from "./google";

export { FigmaLinkKind } from "./figma";

export { AtlassianLinkKind } from "./atlassian";

export { WorkLinkKind, type WorkProvider } from "./work";

export { AppLinkProvider } from "./provider";
