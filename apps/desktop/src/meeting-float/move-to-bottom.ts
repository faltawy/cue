import { getIslandBottomMigration } from "./settings";

import { getStoredSettingValues, setSettingValues } from "~/settings/queries";

export async function moveIslandToBottomOnce(): Promise<void> {
  const stored = await getStoredSettingValues();
  const updates = getIslandBottomMigration(stored.values);
  if (Object.keys(updates).length > 0) {
    await setSettingValues(updates);
  }
}
