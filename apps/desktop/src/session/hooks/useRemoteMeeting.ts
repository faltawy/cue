import { RemoteMeetingType } from "~/session/enums";
export { RemoteMeetingType };

export type RemoteMeeting = {
  type: RemoteMeetingType;
  url: string;
};

function isXCallId(segment: string | undefined): boolean {
  return !!segment && segment !== "new" && !/^(g\d+|\d+-\d+)$/.test(segment);
}

function isXCallUrl(parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);

  if (hostname === "call.x.com") {
    return segments.length === 1 && isXCallId(segments[0]);
  }

  if (hostname === "x.com" || hostname === "www.x.com") {
    return (
      (segments.length === 3 &&
        segments[0] === "i" &&
        segments[1] === "call" &&
        isXCallId(segments[2])) ||
      (segments.length === 2 &&
        segments[0] === "call" &&
        isXCallId(segments[1]))
    );
  }

  return false;
}

export function detectMeetingType(url: string): RemoteMeetingType | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.includes("zoom.us")) {
      return RemoteMeetingType.Zoom;
    }
    if (hostname.includes("meet.google.com")) {
      return RemoteMeetingType.GoogleMeet;
    }
    if (hostname.includes("webex.com")) {
      return RemoteMeetingType.Webex;
    }
    if (hostname.includes("teams.microsoft.com")) {
      return RemoteMeetingType.Teams;
    }
    if (hostname === "app.cal.com" && parsed.pathname.startsWith("/video/")) {
      return RemoteMeetingType.CalCom;
    }
    if (isXCallUrl(parsed)) {
      return RemoteMeetingType.XCall;
    }
    return null;
  } catch {
    return null;
  }
}

export function getRemoteMeeting(
  meetingLink: string | null | undefined,
): RemoteMeeting | null {
  if (!meetingLink) {
    return null;
  }

  const type = detectMeetingType(meetingLink);
  if (!type) {
    return null;
  }

  return { type, url: meetingLink };
}
