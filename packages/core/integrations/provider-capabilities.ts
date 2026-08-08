import { z } from "zod";
import type { ActivityPlanDuration, ActivityPlanTarget } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export const integrationProviderIdValues = [
  "wahoo",
  "strava",
  "trainingpeaks",
  "garmin",
  "zwift",
] as const;
export const integrationProviderIdSchema = z.enum(integrationProviderIdValues);
export type IntegrationProviderId = z.infer<typeof integrationProviderIdSchema>;

export const providerCapabilityValues = [
  "profile_enrichment_read",
  "activity_history_read",
  "activity_file_download",
  "activity_file_format_fit",
  "planned_activity_push",
  "completed_activity_push",
  "route_push",
  "webhook_activity_updates",
] as const;
export const providerCapabilitySchema = z.enum(providerCapabilityValues);
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerConfigurableActionSchema = z.enum([
  "refresh_setup_data",
  "sync_now",
  "disconnect",
]);
export type ProviderConfigurableAction = z.infer<typeof providerConfigurableActionSchema>;

export const providerSyncModeSchema = z.enum(["automatic", "manual", "unsupported"]);
export type ProviderSyncMode = z.infer<typeof providerSyncModeSchema>;

export type ProviderPlannedActivityMaturity = "available" | "evidence_gated";

export type ProviderPlannedActivityCapability = {
  maturity: ProviderPlannedActivityMaturity;
  supportedDurations: readonly ActivityPlanDuration["type"][];
  supportedActivityCategories: readonly CanonicalActivityCategory[];
  supportedTargets: readonly ActivityPlanTarget["type"][];
  supportsBoundaries: boolean;
  supportsMultipleTargets: boolean;
};

export type ProviderCapabilityDefinition = {
  capabilities: readonly ProviderCapability[];
  /** A stable, user-safe explanation for capabilities deliberately withheld. */
  unavailableReasons?: Partial<Record<ProviderCapability, string>>;
  id: IntegrationProviderId;
  label: string;
  plannedActivities: ProviderPlannedActivityCapability;
  syncModes: Partial<Record<ProviderCapability, Exclude<ProviderSyncMode, "unsupported">>>;
};

const automaticSyncCapabilities = [
  "activity_history_read",
  "planned_activity_push",
  "webhook_activity_updates",
] as const satisfies readonly ProviderCapability[];

const wahooPlannedActivities = {
  maturity: "available",
  supportedDurations: ["time", "distance"],
  supportedActivityCategories: ["run", "bike"],
  supportedTargets: ["%FTP", "%MaxHR", "%ThresholdHR", "watts", "bpm", "speed", "cadence"],
  supportsBoundaries: false,
  supportsMultipleTargets: false,
} as const satisfies ProviderPlannedActivityCapability;

const evidenceGatedPlannedActivities = {
  maturity: "evidence_gated",
  supportedDurations: [],
  supportedActivityCategories: [],
  supportedTargets: [],
  supportsBoundaries: false,
  supportsMultipleTargets: false,
} as const satisfies ProviderPlannedActivityCapability;

const providerCapabilityMap = {
  wahoo: {
    id: "wahoo",
    label: "Wahoo",
    plannedActivities: wahooPlannedActivities,
    capabilities: [
      "profile_enrichment_read",
      "activity_history_read",
      "activity_file_download",
      "activity_file_format_fit",
      "planned_activity_push",
      "webhook_activity_updates",
    ],
    syncModes: {
      profile_enrichment_read: "manual",
      activity_history_read: "automatic",
      activity_file_download: "automatic",
      activity_file_format_fit: "automatic",
      planned_activity_push: "automatic",
      webhook_activity_updates: "automatic",
    },
    unavailableReasons: {
      route_push:
        "Wahoo route push is disabled because uncertain create outcomes cannot be reconciled under the documented API.",
    },
  },
  strava: {
    id: "strava",
    label: "Strava",
    plannedActivities: evidenceGatedPlannedActivities,
    capabilities: ["activity_history_read", "completed_activity_push", "webhook_activity_updates"],
    syncModes: {
      activity_history_read: "manual",
      completed_activity_push: "manual",
      webhook_activity_updates: "automatic",
    },
  },
  trainingpeaks: {
    id: "trainingpeaks",
    label: "TrainingPeaks",
    plannedActivities: evidenceGatedPlannedActivities,
    capabilities: [],
    syncModes: {},
  },
  garmin: {
    id: "garmin",
    label: "Garmin",
    plannedActivities: evidenceGatedPlannedActivities,
    capabilities: ["activity_history_read"],
    syncModes: {
      activity_history_read: "manual",
    },
  },
  zwift: {
    id: "zwift",
    label: "Zwift",
    plannedActivities: evidenceGatedPlannedActivities,
    capabilities: [],
    syncModes: {},
  },
} as const satisfies Record<IntegrationProviderId, ProviderCapabilityDefinition>;

export const providerCapabilityRegistry = integrationProviderIdValues.map(
  (provider) => providerCapabilityMap[provider],
) satisfies readonly ProviderCapabilityDefinition[];

export function getProviderCapabilityDefinition(
  provider: IntegrationProviderId,
): ProviderCapabilityDefinition {
  return providerCapabilityMap[provider];
}

export function getProviderPlannedActivityCapability(
  provider: IntegrationProviderId,
): ProviderPlannedActivityCapability {
  return getProviderCapabilityDefinition(provider).plannedActivities;
}

export function providerHasCapability(
  provider: IntegrationProviderId,
  capability: ProviderCapability,
): boolean {
  return getProviderCapabilityDefinition(provider).capabilities.includes(capability);
}

export function getProviderCapabilityUnavailableReason(
  provider: IntegrationProviderId,
  capability: ProviderCapability,
): string | null {
  const definition = getProviderCapabilityDefinition(provider);
  return definition.capabilities.includes(capability)
    ? null
    : (definition.unavailableReasons?.[capability] ?? null);
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

/** Static product target only; API runtime admission still owns enablement, grants, and fences. */
export function isProviderActivityHistoryReconciliationTarget(
  provider: IntegrationProviderId,
): boolean {
  return (
    providerHasCapability(provider, "activity_history_read") &&
    providerHasCapability(provider, "activity_file_download")
  );
}
