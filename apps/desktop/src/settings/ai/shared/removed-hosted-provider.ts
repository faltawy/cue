// Saved settings can still reference these retired hosted providers.
const REMOVED_HOSTED_PROVIDER_IDS = new Set(["anarlog", "hyprnote"]);

export function isRemovedHostedProviderId(providerId: string | undefined) {
  return !!providerId && REMOVED_HOSTED_PROVIDER_IDS.has(providerId);
}
