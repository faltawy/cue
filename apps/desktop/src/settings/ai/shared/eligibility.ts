import {
  ProviderRequirementKind,
  EligibilityBlockerCode,
} from "~/settings/enums";

export type ConfigField = "base_url" | "api_key";

export type ProviderRequirement =
  | { kind: ProviderRequirementKind.RequiresConfig; fields: ConfigField[] }
  | {
      kind: ProviderRequirementKind.RequiresPlatform;
      platform: "apple_silicon";
    };

export function getRequiredConfigFields(
  requirements: readonly ProviderRequirement[],
): ConfigField[] {
  const req = requirements.find(
    (r) => r.kind === ProviderRequirementKind.RequiresConfig,
  );
  return req?.kind === ProviderRequirementKind.RequiresConfig ? req.fields : [];
}

export type ProviderEligibilityContext = {
  config?: { base_url?: string; api_key?: string };
};

export function getProviderSelectionBlockers(
  requirements: readonly ProviderRequirement[],
  context: ProviderEligibilityContext,
): EligibilityBlocker[] {
  const blockers: EligibilityBlocker[] = [];

  for (const req of requirements) {
    switch (req.kind) {
      case ProviderRequirementKind.RequiresConfig: {
        const missingFields = req.fields.filter((field) => {
          const value = context.config?.[field];
          return !value || value.trim() === "";
        });
        if (missingFields.length > 0) {
          blockers.push({
            code: EligibilityBlockerCode.MissingConfig,
            fields: missingFields,
          });
        }
        break;
      }
      case ProviderRequirementKind.RequiresPlatform:
        break;
    }
  }

  return blockers;
}

export type EligibilityBlocker =
  | { code: EligibilityBlockerCode.MissingProvider }
  | { code: EligibilityBlockerCode.MissingModel }
  | { code: EligibilityBlockerCode.ProviderDisabled }
  | {
      code: EligibilityBlockerCode.MissingConfig;
      fields: Array<"base_url" | "api_key">;
    }
  | { code: EligibilityBlockerCode.ModelNotDownloaded; modelId: string }
  | {
      code: EligibilityBlockerCode.UnsupportedPlatform;
      required: "apple_silicon";
    };
