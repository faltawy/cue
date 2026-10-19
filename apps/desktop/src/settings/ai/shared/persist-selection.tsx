import { useMountEffect } from "@anlg/ui/hooks/use-mount-effect";

import { useSetSettingValues } from "~/settings/queries";

export function PersistAiSelection({
  provider,
  model,
}: {
  provider: string;
  model: string;
}) {
  const setSettingValues = useSetSettingValues();

  useMountEffect(() => {
    setSettingValues({
      current_stt_provider: provider,
      current_stt_model: model,
    });
  });

  return null;
}
