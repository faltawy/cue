import {
  BrowserEventKind,
  CaptureAvailability,
} from "@anlg/assistant/browser-context";

import { type Snapshot } from "./protocol";

const CAPTIONS = '[jsname="dsyhDe"], [data-caption-container]';
const CAPTION_ROW = '[data-caption-id], .TBMuR, [jsname="tgaKEf"]';
const CHAT_ROW = "[data-message-id], [data-chat-message-id]";
const PARTICIPANT = "[data-participant-id]";
const PRESENTATION =
  '[data-is-presentation="true"], [data-is-presenting="true"], [data-presentation-id]';

function text(element: Element | null, limit = 4096): string {
  return (element?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
function visible(element: Element): boolean {
  if (element.closest('[aria-hidden="true"], [hidden]')) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return style?.display !== "none" && style?.visibility !== "hidden";
}

export class MeetReader {
  private events = new Map<string, Snapshot["events"][number]>();
  private nodeIds = new WeakMap<Element, string>();
  private participants = new Map<string, Snapshot["participants"][number]>();
  private ids = new Map<string, string>();
  private sawParticipants = false;

  private id(source: string): string {
    let id = this.ids.get(source);
    if (!id) {
      id = crypto.randomUUID();
      this.ids.set(source, id);
    }
    return id;
  }
  private event(
    element: Element,
    kind: BrowserEventKind,
    content: string,
    participantId: string | null,
  ) {
    if (!content) return;
    const source =
      element.getAttribute("data-message-id") ??
      element.getAttribute("data-chat-message-id") ??
      element.getAttribute("data-caption-id");
    let id = source ? this.id(`${kind}:${source}`) : this.nodeIds.get(element);
    if (!id) {
      id = crypto.randomUUID();
      this.nodeIds.set(element, id);
    }
    const previous = this.events.get(id);
    this.events.set(id, {
      id,
      kind,
      text: content,
      participant_id: participantId,
      timestamp_ms: previous?.timestamp_ms ?? Date.now(),
    });
  }

  read(document: Document): Snapshot {
    const current = new Map<string, Snapshot["participants"][number]>();
    for (const element of document.querySelectorAll(PARTICIPANT)) {
      if (!visible(element)) continue;
      const source = element.getAttribute("data-participant-id")!;
      const id = this.id(`person:${source}`);
      const name =
        element.getAttribute("data-self-name") ??
        element.getAttribute("data-participant-name") ??
        text(
          element.querySelector(
            '[data-participant-name], [jsname="d93U2d"], .zWGUib',
          ),
          256,
        );
      if (!name) continue;
      const previous = current.get(id);
      current.set(id, {
        id,
        name: name.slice(0, 256),
        speaking:
          previous?.speaking === true ||
          element.getAttribute("data-is-speaking") === "true",
        presenting:
          previous?.presenting === true || element.matches(PRESENTATION),
      });
      if (element.querySelector('[data-hand-raised="true"]'))
        this.event(
          element.querySelector('[data-hand-raised="true"]')!,
          BrowserEventKind.HandRaised,
          `${name} raised a hand`,
          id,
        );
    }
    // Visible tiles are not a complete attendance roster, so disappearing tiles are not departures.
    for (const [id, person] of current) {
      if (this.sawParticipants && !this.participants.has(id)) {
        const eventId = crypto.randomUUID();
        this.events.set(eventId, {
          id: eventId,
          kind: BrowserEventKind.ParticipantJoined,
          timestamp_ms: Date.now(),
          participant_id: id,
          text: `${person.name} appeared in the meeting`,
        });
      }
      this.participants.set(id, person);
    }
    this.sawParticipants ||= current.size > 0;
    const captionContainers = [...document.querySelectorAll(CAPTIONS)].filter(
      visible,
    );
    for (const container of captionContainers) {
      const rows = container.querySelectorAll(CAPTION_ROW);
      for (const row of rows.length ? rows : [container]) {
        const speaker = text(
          row.querySelector("[data-speaker-name], .zs7s8d"),
          256,
        );
        const words = row.matches('[jsname="tgaKEf"]')
          ? [...row.querySelectorAll("span")]
              .map((span) => text(span))
              .join(" ")
              .slice(0, 4096)
          : text(row.querySelector("[data-caption-text], .iTTPOb, .ygicle"));
        if (words)
          this.event(
            row,
            BrowserEventKind.Caption,
            speaker ? `${speaker}: ${words}` : words,
            null,
          );
      }
    }
    const chatRows = [...document.querySelectorAll(CHAT_ROW)].filter(visible);
    for (const row of chatRows) {
      const sender =
        row.getAttribute("data-sender-name") ??
        text(row.querySelector("[data-sender-name], .YTbUzc"), 256);
      const body = text(
        row.querySelector('[data-message-text], [jsname="dTKtvb"], .oIy2qc'),
      );
      if (body)
        this.event(
          row,
          BrowserEventKind.Chat,
          sender ? `${sender}: ${body}` : body,
          null,
        );
    }
    for (const element of document.querySelectorAll("[data-reaction]")) {
      if (visible(element))
        this.event(
          element,
          BrowserEventKind.Reaction,
          element.getAttribute("data-reaction")?.slice(0, 128) ?? "",
          null,
        );
    }
    while (this.events.size > 150)
      this.events.delete(this.events.keys().next().value!);
    while (this.participants.size > 250)
      this.participants.delete(this.participants.keys().next().value!);
    if (this.ids.size > 3000) this.ids.clear();
    // Leave room for the presentation image and envelope under the native message limit.
    let bytes = 0;
    const events = [...this.events.values()]
      .reverse()
      .filter((event) => {
        bytes += new TextEncoder().encode(JSON.stringify(event)).length;
        return bytes < 180_000;
      })
      .reverse();
    return {
      title: (
        document
          .querySelector("[data-meeting-title]")
          ?.getAttribute("data-meeting-title") ??
        document.title.replace(/ - Google Meet$/, "")
      ).slice(0, 512),
      captions: captionContainers.length
        ? CaptureAvailability.Available
        : CaptureAvailability.Unavailable,
      chat:
        chatRows.length ||
        document.querySelector('[aria-label="In-call messages"]')
          ? CaptureAvailability.Available
          : CaptureAvailability.Unavailable,
      participants: [...this.participants.values()].map((person) => ({
        ...person,
        speaking: current.get(person.id)?.speaking ?? false,
        presenting: current.get(person.id)?.presenting ?? false,
      })),
      events,
      presentation: null,
    };
  }
}

export function presentationVideo(document: Document): HTMLVideoElement | null {
  for (const element of document.querySelectorAll(PRESENTATION)) {
    if (!visible(element)) continue;
    const videos = element.querySelectorAll("video");
    for (const video of videos)
      if (
        video.videoWidth >= 320 &&
        video.videoHeight >= 180 &&
        video.readyState >= 2
      )
        return video;
  }
  return null;
}

export function capturePresentation(
  document: Document,
): Snapshot["presentation"] {
  const video = presentationVideo(document);
  if (!video) return null;
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 1280 / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const jpeg = canvas.toDataURL("image/jpeg", 0.65).split(",")[1];
  return jpeg && jpeg.length <= 400_000
    ? { timestamp_ms: Date.now(), jpeg_base64: jpeg }
    : null;
}
