export enum DebugEvent {
  NativeRequest = "native_request",
  NativeReply = "native_reply",
  NativeDisconnect = "native_disconnect",
  Connection = "connection",
  Snapshot = "snapshot",
}

const LIMIT = 400;
let enabled = false;
let entries: {
  at: string;
  event: DebugEvent;
  run_id?: string;
  operation?: string;
  code?: string;
  duration_ms?: number;
}[] = [];
let persist: ReturnType<typeof setTimeout> | undefined;

export async function initializeDebug() {
  const settings = await chrome.storage.local.get("debugEnabled");
  enabled = settings.debugEnabled === true;
  const saved = await chrome.storage.session.get("debugEntries");
  if (enabled && Array.isArray(saved.debugEntries))
    entries = saved.debugEntries.slice(-LIMIT);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.debugEnabled) {
      enabled = changes.debugEnabled.newValue === true;
      if (!enabled) void clearDebug();
    }
  });
}
export function debugEnabled() {
  return enabled;
}
export function debug(
  event: DebugEvent,
  fields: {
    run_id?: string;
    operation?: string;
    code?: string;
    duration_ms?: number;
  } = {},
) {
  if (!enabled) return;
  entries.push({ at: new Date().toISOString(), event, ...fields });
  entries = entries.slice(-LIMIT);
  if (persist) return;
  persist = setTimeout(() => {
    persist = undefined;
    void chrome.storage.session
      .set({ debugEntries: entries })
      .catch(() => undefined);
  }, 250);
}
export async function clearDebug() {
  entries = [];
  if (persist) clearTimeout(persist);
  persist = undefined;
  await chrome.storage.session.remove("debugEntries");
}
export function exportDebug() {
  return {
    extension_version: chrome.runtime.getManifest().version,
    exported_at: new Date().toISOString(),
    enabled,
    entries,
  };
}
