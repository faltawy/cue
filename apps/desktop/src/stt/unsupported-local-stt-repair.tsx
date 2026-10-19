import { arch } from "@tauri-apps/plugin-os";
import { useEffect } from "react";

import { setSettingValues } from "~/settings/queries";
import { useConfigValues } from "~/shared/config";
import { getUnsupportedDesktopLocalSttRepair } from "~/stt/capabilities";

export function UnsupportedLocalSttRepair() {
  const {
    current_stt_provider: currentSttProvider,
    current_stt_model: currentSttModel,
  } = useConfigValues(["current_stt_provider", "current_stt_model"] as const);

  useEffect(() => {
    const repair = getUnsupportedDesktopLocalSttRepair(
      arch(),
      currentSttProvider,
      currentSttModel,
    );
    if (!repair) {
      return;
    }

    void setSettingValues({
      current_stt_provider: repair.provider,
      current_stt_model: repair.model,
    });
  }, [currentSttModel, currentSttProvider]);

  return null;
}
