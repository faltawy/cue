import { ErrorCode, ExtensionError } from "./errors";
import { MeetingPhase } from "./lifecycle";
import { ContentAction } from "./protocol";

export async function probeMeeting(tabId: number, api = chrome) {
  const probe = async () => {
    try {
      return await api.tabs.sendMessage(tabId, { kind: ContentAction.Probe });
    } catch {
      return null;
    }
  };
  let result = await probe();
  if (!result || result.phase === MeetingPhase.Unknown) {
    try {
      await api.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ["content.js"],
      });
    } catch {
      throw new ExtensionError(
        ErrorCode.PageUnavailable,
        "Brave could not load Cue’s meeting reader. Check Cue’s site access for meet.google.com, then retry.",
      );
    }
    result = await probe();
  }
  if (!result)
    throw new ExtensionError(
      ErrorCode.PageUnavailable,
      "Cue’s meeting reader did not respond after recovery. Retry, or refresh Meet when it is safe to rejoin.",
    );
  if (
    !Object.values(MeetingPhase).includes(result.phase) ||
    result.phase === MeetingPhase.Unknown
  )
    throw new ExtensionError(
      ErrorCode.PhaseUnknown,
      "Cue can reach the page but cannot identify the meeting state. Report this code if you are already in the call.",
    );
  return result.phase as MeetingPhase;
}
