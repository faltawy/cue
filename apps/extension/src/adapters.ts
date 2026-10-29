import { BrowserPlatform } from "@anlg/assistant/browser-context";

import { meetPhase, MeetingPhase } from "./lifecycle";
import { capturePresentation, MeetReader } from "./meet";
import { type Snapshot } from "./protocol";

export type MeetingAdapter = {
  platform: BrowserPlatform;
  name: string;
  match(url: URL): boolean;
  meetingUrl(url: URL): string;
  createReader(): { read(document: Document): Snapshot };
  phase(document: Document): MeetingPhase;
  presentation(document: Document): Snapshot["presentation"];
};

export const adapters: readonly MeetingAdapter[] = [
  {
    platform: BrowserPlatform.GoogleMeet,
    name: "Google Meet",
    match: (url) =>
      url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      /^\/(?:meet\/)?[a-z]{3}-[a-z]{4}-[a-z]{3}$/.test(url.pathname),
    meetingUrl: (url) => `${url.origin}${url.pathname}`,
    createReader: () => new MeetReader(),
    phase: meetPhase,
    presentation: capturePresentation,
  },
];

export function adapterFor(value: string): MeetingAdapter | undefined {
  try {
    const url = new URL(value);
    return adapters.find((adapter) => adapter.match(url));
  } catch {
    return undefined;
  }
}
