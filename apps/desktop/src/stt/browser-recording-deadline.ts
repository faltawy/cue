const deadlines = new Map<string, number>();
export function registerBrowserRecordingDeadline(
  sessionId: string,
  expiresAt: number,
) {
  for (const [id, expiry] of deadlines)
    if (expiry < Date.now() - 300_000) deadlines.delete(id);
  deadlines.set(sessionId, expiresAt);
}
export function browserRecordingDeadline(sessionId: string) {
  return deadlines.get(sessionId);
}
