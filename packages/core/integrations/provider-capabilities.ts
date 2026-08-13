import { z } from "zod";
import type { ActivityPlanDuration, ActivityPlanTarget } from "../activity-plan";
import type { CanonicalActivityCategory } from "../schemas/activity-category";

export const persistentIntegrationSourceIdValues = [
  "wahoo",
  "strava",
  "trainingpeaks",
  "garmin",
  "zwift",
] as const;
export const persistentIntegrationSourceIdSchema = z.enum(persistentIntegrationSourceIdValues);
export type PersistentIntegrationSourceId = z.infer<typeof persistentIntegrationSourceIdSchema>;

export const executableIntegrationProviderIdValues = ["wahoo"] as const;
export const executableIntegrationProviderIdSchema = z.enum(executableIntegrationProviderIdValues);
export type ExecutableIntegrationProviderId = z.infer<typeof executableIntegrationProviderIdSchema>;

export const providerCapabilityValues = [
  "profile_enrichment_read",
  "activity_history_read",
  "activity_file_download",
  "activity_file_format_fit",
  "planned_activity_push",
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

export type ProviderPlannedActivityMaturity = "available";

export type ProviderPlannedActivityCapability = {
  maturity: ProviderPlannedActivityMaturity;
  supportedDurations: readonly ActivityPlanDuration["type"][];
  supportedActivityCategories: readonly CanonicalActivityCategory[];
  supportedTargets: readonly ActivityPlanTarget["type"][];
  supportsBoundaries: boolean;
  supportsMultipleTargets: boolean;
};

export const providerOnboardingPresentationSchema = z
  .object({
    summary: z.string().min(1).max(160),
    evidence: z
      .object({
        activityHistory: z.boolean(),
        profileDetails: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type ProviderOnboardingPresentation = z.infer<typeof providerOnboardingPresentationSchema>;

export type ProviderCapabilityDefinition = {
  capabilities: readonly ProviderCapability[];
  /** A stable, user-safe explanation for capabilities deliberately withheld. */
  unavailableReasons?: Partial<Record<ProviderCapability, string>>;
  id: ExecutableIntegrationProviderId;
  label: string;
  onboarding: ProviderOnboardingPresentation;
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

const providerCapabilityMap = {
  wahoo: {
    id: "wahoo",
    label: "Wahoo",
    onboarding: {
      summary: "Import profile details and activity history from your Wahoo account.",
      evidence: { activityHistory: true, profileDetails: true },
    },
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
} as const satisfies Record<ExecutableIntegrationProviderId, ProviderCapabilityDefinition>;

export const providerCapabilityRegistry = executableIntegrationProviderIdValues.map(
  (provider) => providerCapabilityMap[provider],
) satisfies readonly ProviderCapabilityDefinition[];

export function getProviderCapabilityDefinition(
  provider: ExecutableIntegrationProviderId,
): ProviderCapabilityDefinition {
  return providerCapabilityMap[provider];
}

export function getProviderPlannedActivityCapability(
  provider: ExecutableIntegrationProviderId,
): ProviderPlannedActivityCapability {
  return getProviderCapabilityDefinition(provider).plannedActivities;
}

export function providerHasCapability(
  provider: ExecutableIntegrationProviderId,
  capability: ProviderCapability,
): boolean {
  return (providerCapabilityMap[provider].capabilities as readonly ProviderCapability[]).includes(
    capability,
  );
}

export function getProviderCapabilityUnavailableReason(
  provider: ExecutableIntegrationProviderId,
  capability: ProviderCapability,
): string | null {
  const definition = getProviderCapabilityDefinition(provider);
  return definition.capabilities.includes(capability)
    ? null
    : (definition.unavailableReasons?.[capability] ?? null);
}

export function getProvidersWithCapability(
  providers: readonly ExecutableIntegrationProviderId[],
  capability: ProviderCapability,
): ExecutableIntegrationProviderId[] {
  return providers.filter((provider) => providerHasCapability(provider, capability));
}

export function getProviderSyncMode(
  provider: ExecutableIntegrationProviderId,
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
  provider: ExecutableIntegrationProviderId,
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
  provider: ExecutableIntegrationProviderId,
): boolean {
  return (
    providerHasCapability(provider, "activity_history_read") &&
    providerHasCapability(provider, "activity_file_download")
  );
}
