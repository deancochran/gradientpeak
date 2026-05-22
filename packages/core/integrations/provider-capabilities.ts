import { z } from "zod";

export const integrationProviderIdSchema = z.enum([
  "wahoo",
  "strava",
  "trainingpeaks",
  "garmin",
  "zwift",
]);
export type IntegrationProviderId = z.infer<typeof integrationProviderIdSchema>;

export const providerCapabilitySchema = z.enum([
  "profile_enrichment_read",
  "activity_history_read",
  "activity_file_download",
  "activity_file_format_fit",
  "planned_activity_push",
  "completed_activity_push",
  "route_push",
  "webhook_activity_updates",
]);
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerConfigurableActionSchema = z.enum([
  "refresh_setup_data",
  "sync_now",
  "disconnect",
]);
export type ProviderConfigurableAction = z.infer<typeof providerConfigurableActionSchema>;

export const providerSyncModeSchema = z.enum(["automatic", "manual", "unsupported"]);
export type ProviderSyncMode = z.infer<typeof providerSyncModeSchema>;

export type ProviderCapabilityDefinition = {
  capabilities: readonly ProviderCapability[];
  id: IntegrationProviderId;
  label: string;
  syncModes: Partial<Record<ProviderCapability, Exclude<ProviderSyncMode, "unsupported">>>;
};

const automaticSyncCapabilities = [
  "activity_history_read",
  "planned_activity_push",
  "webhook_activity_updates",
] as const satisfies readonly ProviderCapability[];

export const providerCapabilityRegistry = [
  {
    id: "wahoo",
    label: "Wahoo",
    capabilities: [
      "profile_enrichment_read",
      "activity_history_read",
      "activity_file_download",
      "activity_file_format_fit",
      "planned_activity_push",
      "route_push",
      "webhook_activity_updates",
    ],
    syncModes: {
      profile_enrichment_read: "manual",
      activity_history_read: "automatic",
      activity_file_download: "automatic",
      activity_file_format_fit: "automatic",
      planned_activity_push: "automatic",
      route_push: "automatic",
      webhook_activity_updates: "automatic",
    },
  },
  {
    id: "strava",
    label: "Strava",
    capabilities: ["activity_history_read", "completed_activity_push", "webhook_activity_updates"],
    syncModes: {
      activity_history_read: "manual",
      completed_activity_push: "manual",
      webhook_activity_updates: "automatic",
    },
  },
  {
    id: "trainingpeaks",
    label: "TrainingPeaks",
    capabilities: [],
    syncModes: {},
  },
  {
    id: "garmin",
    label: "Garmin",
    capabilities: ["activity_history_read"],
    syncModes: {
      activity_history_read: "manual",
    },
  },
  {
    id: "zwift",
    label: "Zwift",
    capabilities: [],
    syncModes: {},
  },
] as const satisfies readonly ProviderCapabilityDefinition[];

export function getProviderCapabilityDefinition(
  provider: IntegrationProviderId,
): ProviderCapabilityDefinition {
  return (
    providerCapabilityRegistry.find((definition) => definition.id === provider) ?? {
      id: provider,
      label: provider,
      capabilities: [],
      syncModes: {},
    }
  );
}

export function providerHasCapability(
  provider: IntegrationProviderId,
  capability: ProviderCapability,
): boolean {
  return getProviderCapabilityDefinition(provider).capabilities.includes(capability);
}

export function getProvidersWithCapability(
  providers: readonly IntegrationProviderId[],
  capability: ProviderCapability,
): IntegrationProviderId[] {
  return providers.filter((provider) => providerHasCapability(provider, capability));
}

export function getProviderSyncMode(
  provider: IntegrationProviderId,
  capability: ProviderCapability,
): ProviderSyncMode {
  const definition = getProviderCapabilityDefinition(provider);
  if (!definition.capabilities.includes(capability)) return "unsupported";

  return (
    definition.syncModes[capability] ??
    ((automaticSyncCapabilities as readonly ProviderCapability[]).includes(capability)
      ? "automatic"
      : "manual")
  );
}

export function getConfigurableProviderActions(
  provider: IntegrationProviderId,
): ProviderConfigurableAction[] {
  const actions = new Set<ProviderConfigurableAction>(["disconnect"]);
  const canSyncNow =
    providerHasCapability(provider, "activity_history_read") &&
    providerHasCapability(provider, "activity_file_download");

  if (canSyncNow) {
    actions.add("sync_now");
  } else if (providerHasCapability(provider, "profile_enrichment_read")) {
    actions.add("refresh_setup_data");
  }

  return Array.from(actions);
}
