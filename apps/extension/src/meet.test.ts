import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { expect, test } from "bun:test";

import {
  BrowserEventKind,
  CaptureAvailability,
} from "@anlg/assistant/browser-context";

import { adapterFor } from "./adapters";
import { meetPhase, MeetingPhase } from "./lifecycle";
import { MeetReader, presentationVideo } from "./meet";

GlobalRegistrator.register();

test("retains progressive captions and visible chat without leaking hidden content or mistaking camera video for a presentation", () => {
  document.body.innerHTML = `<div jsname="dsyhDe"><div jsname="tgaKEf"><span>Hello</span></div></div>
  <div data-message-id="m1" data-sender-name="Sam"><div jsname="dTKtvb">The deadline is Friday</div></div>
  <div hidden data-message-id="m2"><div jsname="dTKtvb">Hidden message</div></div>
  <div data-participant-id="people/123" data-participant-name="Sam"><video></video></div>`;
  const reader = new MeetReader();
  const first = reader.read(document);
  expect(first.captions).toBe(CaptureAvailability.Available);
  expect(first.events.map((event) => event.text)).toEqual([
    "Hello",
    "Sam: The deadline is Friday",
  ]);
  document.querySelector('[jsname="tgaKEf"] span')!.textContent =
    "Hello everyone";
  const second = reader.read(document);
  expect(
    second.events.filter((event) => event.kind === BrowserEventKind.Caption),
  ).toMatchObject([{ id: first.events[0]!.id, text: "Hello everyone" }]);
  document.querySelector('[jsname="dsyhDe"]')!.remove();
  const afterCaptionsClose = reader.read(document);
  expect(afterCaptionsClose.captions).toBe(CaptureAvailability.Unavailable);
  expect(afterCaptionsClose.events[0]?.text).toBe("Hello everyone");
  const video = document.querySelector("video")!;
  Object.defineProperties(video, {
    videoWidth: { value: 1280 },
    videoHeight: { value: 720 },
    readyState: { value: 4 },
  });
  expect(presentationVideo(document)).toBeNull();
  video.parentElement!.setAttribute("data-is-presentation", "true");
  expect(presentationVideo(document)).toBe(video);
});

test("meeting lifecycle requires in-call evidence and distinguishes admission, reconnection and removal", () => {
  document.body.innerHTML = "<button>Join now</button>";
  expect(meetPhase(document)).toBe(MeetingPhase.Lobby);
  document.body.innerHTML =
    '<div role="status">Waiting for the host to let you in</div>';
  expect(meetPhase(document)).toBe(MeetingPhase.Joining);
  document.body.innerHTML =
    '<button aria-label="مغادرة المكالمة"><i>call_end</i></button>';
  expect(meetPhase(document)).toBe(MeetingPhase.InMeeting);
  document.body.insertAdjacentHTML(
    "beforeend",
    '<div role="alert">Reconnecting</div>',
  );
  expect(meetPhase(document)).toBe(MeetingPhase.Reconnecting);
  document.body.innerHTML = "<h1>You have been removed from the meeting</h1>";
  expect(meetPhase(document)).toBe(MeetingPhase.Ended);
  expect(
    adapterFor("https://meet.google.com/meet/abc-defg-hij?authuser=1")?.name,
  ).toBe("Google Meet");
  expect(adapterFor("https://meet.google.com/abc-defg-hij")?.name).toBe(
    "Google Meet",
  );
  expect(
    adapterFor("https://meet.google.com.evil.test/abc-defg-hij"),
  ).toBeUndefined();
  expect(adapterFor("https://meet.google.com/")).toBeUndefined();
});
