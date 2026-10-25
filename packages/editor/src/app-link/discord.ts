import { AppLinkProvider } from "./provider";

export enum DiscordLinkKind {
  Channel = "channel",
  Message = "message",
  Invite = "invite",
}

export interface DiscordAttrs {
  provider: AppLinkProvider.Discord;
  kind: DiscordLinkKind;
  url: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  inviteCode?: string;
}

export function getDiscordDisplayParts(attrs: DiscordAttrs): {
  header: string;
  subline: string;
} {
  switch (attrs.kind) {
    case DiscordLinkKind.Invite:
      return { header: "Discord", subline: `Invite ${attrs.inviteCode}` };
    case DiscordLinkKind.Channel:
      return { header: "Discord", subline: "Channel" };
    case DiscordLinkKind.Message:
      return { header: "Discord", subline: "Message" };
  }
}
