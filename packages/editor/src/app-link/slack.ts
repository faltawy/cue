import { AppLinkProvider } from "./provider";

export enum SlackLinkKind {
  Channel = "channel",
  Message = "message",
  Thread = "thread",
}

export interface SlackAttrs {
  provider: AppLinkProvider.Slack;
  kind: SlackLinkKind;
  url: string;
  workspace: string;
  channelId: string;
  messageTs?: string;
  threadTs?: string;
}

export function getSlackDisplayParts(attrs: SlackAttrs): {
  header: string;
  subline: string;
} {
  switch (attrs.kind) {
    case SlackLinkKind.Channel:
      return { header: attrs.workspace, subline: `#${attrs.channelId}` };
    case SlackLinkKind.Message:
      return {
        header: attrs.workspace,
        subline: `Message in #${attrs.channelId}`,
      };
    case SlackLinkKind.Thread:
      return {
        header: attrs.workspace,
        subline: `Thread in #${attrs.channelId}`,
      };
  }
}
