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

export const executableIntegrationProviderIdValues = ["wahoo", "strava"] as const;
export const executableIntegrationProviderIdSchema = z.enum(executableIntegrationProviderIdValues);
export type ExecutableIntegrationProviderId = z.infer<typeof executableIntegrationProviderIdSchema>;

/** Connection describes how a connector is established, independently from where it executes. */
export const providerConnectionDescriptorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("oauth2") }).strict(),
  z.object({ kind: z.literal("device_permissions") }).strict(),
  z.object({ kind: z.literal("api_key") }).strict(),
  z.object({ kind: z.literal("file_import") }).strict(),
  z.object({ kind: z.literal("none") }).strict(),
]);
export type ProviderConnectionDescriptor = z.infer<typeof providerConnectionDescriptorSchema>;
export type OAuth2ProviderConnectionDescriptor = Extract<
  ProviderConnectionDescriptor,
  { kind: "oauth2" }
>;
/** Compatibility name for consumers that previously used the connection model type. */
export const providerConnectionModelSchema = providerConnectionDescriptorSchema;
export type ProviderConnectionModel = ProviderConnectionDescriptor;

export const providerExecutionSchema = z.enum(["server", "mobile", "hybrid"]);
export type ProviderExecution = z.infer<typeof providerExecutionSchema>;

export const providerCapabilityValues = [
  "profile_enrichment_read",
  "activity_history_read",
  "activity_file_download",
  "activity_file_format_fit",
  "completed_activity_export",
  "planned_activity_push",
  "route_push",
  "webhook_activity_updates",
] as const;
export const providerCapabilitySchema = z.enum(providerCapabilityValues);
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerOperationTokenSchema = z.enum([
  "oauth_authorization",
  "oauth_callback",
  "profile_enrichment",
  "activity_history_reconcile",
  "activity_file_import",
  "completed_activity_export",
  "planned_activity_push",
  "webhook_activity_updates",
  "disconnect",
]);
export type ProviderOperationToken = z.infer<typeof providerOperationTokenSchema>;

export const providerConfigurableActionSchema = z.enum([
  "refresh_setup_data",
  "sync_now",
  "disconnect",
]);
export type ProviderConfigurableAction = z.infer<typeof providerConfigurableActionSchema>;

export type ProviderActionAuthorization = {
  action: ProviderConfigurableAction;
  capability?: ProviderCapability;
  /** Actions exposed in a connected integration's normal controls. */
  userFacing: boolean;
};

export type SupportedProviderCapability = {
  status: "supported";
  operations: readonly ProviderOperationToken[];
  requiredScopes: readonly string[];
  syncMode?: Exclude<ProviderSyncMode, "unsupported">;
};

export type UnsupportedProviderCapability = {
  status: "unsupported";
  reason: string;
  operations?: never;
  syncMode?: never;
};

export type ProviderCapabilityDeclaration =
  | SupportedProviderCapability
  | UnsupportedProviderCapability;

export const providerSourceProvenanceSchema = z
  .object({
    connector: z
      .object({
        connectorId: executableIntegrationProviderIdSchema,
        externalId: z.string().min(1),
      })
      .strict(),
    source: z
      .object({
        sourceId: z.string().min(1),
        externalId: z.string().min(1),
      })
      .strict(),
  })
  .strict();
export type ProviderSourceProvenance = z.infer<typeof providerSourceProvenanceSchema>;

export function createDirectProviderSourceProvenance(input: {
  connectorId: ExecutableIntegrationProviderId;
  externalId: string;
}): ProviderSourceProvenance {
  return providerSourceProvenanceSchema.parse({
    connector: { connectorId: input.connectorId, externalId: input.externalId },
    source: { sourceId: input.connectorId, externalId: input.externalId },
  });
}

export const providerSyncModeSchema = z.enum(["automatic", "manual", "unsupported"]);
export type ProviderSyncMode = z.infer<typeof providerSyncModeSchema>;

export type ProviderPlannedActivityMaturity = "available" | "unavailable";

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

export type ProviderWorkerRequirement = {
  operation: ProviderOperationToken;
  worker: string;
};

/** Generic, runtime-neutral connector manifest; registry membership is intentionally separate. */
export type ProviderManifest<
  TConnectorId extends string = string,
  TDefaultSourceId extends string = string,
  TConnection extends ProviderConnectionDescriptor = ProviderConnectionDescriptor,
  TExecution extends ProviderExecution = ProviderExecution,
> = {
  /** Legacy connector key. New code should use connectorId. */
  id: TConnectorId;
  connectorId: TConnectorId;
  /** Default origin for direct integrations; individual records may identify another source. */
  defaultSourceId: TDefaultSourceId;
  connection: TConnection;
  execution: TExecution;
  label: string;
  onboarding: ProviderOnboardingPresentation;
  plannedActivities: ProviderPlannedActivityCapability;
  capabilities: Readonly<Record<ProviderCapability, ProviderCapabilityDeclaration>>;
  /** Lifecycle and connection operations are explicit even when not user capabilities. */
  runtimeOperations: readonly ProviderOperationToken[];
  actions: readonly ProviderActionAuthorization[];
  workerRequirements: readonly ProviderWorkerRequirement[];
};

export type ProviderCapabilityDefinition = ProviderManifest<
  ExecutableIntegrationProviderId,
  PersistentIntegrationSourceId
>;

const wahooPlannedActivities = {
  maturity: "available",
  supportedDurations: ["time", "distance"],
  supportedActivityCategories: ["run", "bike"],
  supportedTargets: ["%FTP", "%MaxHR", "%ThresholdHR", "watts", "bpm", "speed", "cadence"],
  supportsBoundaries: false,
  supportsMultipleTargets: false,
} as const satisfies ProviderPlannedActivityCapability;

const unavailablePlannedActivities = {
  maturity: "unavailable",
  supportedDurations: [],
  supportedActivityCategories: [],
  supportedTargets: [],
  supportsBoundaries: false,
  supportsMultipleTargets: false,
} as const satisfies ProviderPlannedActivityCapability;

export const wahooProviderManifest = {
  id: "wahoo",
  connectorId: "wahoo",
  defaultSourceId: "wahoo",
  connection: { kind: "oauth2" },
  execution: "server",
  label: "Wahoo",
  onboarding: {
    summary: "Import profile details and activity history from your Wahoo account.",
    evidence: { activityHistory: true, profileDetails: true },
  },
  plannedActivities: wahooPlannedActivities,
  capabilities: {
    profile_enrichment_read: {
      status: "supported",
      operations: ["profile_enrichment"],
      requiredScopes: ["user_read"],
      syncMode: "manual",
    },
    activity_history_read: {
      status: "supported",
      operations: ["activity_history_reconcile"],
      requiredScopes: ["workouts_read", "offline_data"],
      syncMode: "automatic",
    },
    activity_file_download: {
      status: "supported",
      operations: ["activity_file_import"],
      requiredScopes: ["workouts_read", "offline_data"],
      syncMode: "automatic",
    },
    activity_file_format_fit: {
      status: "supported",
      operations: ["activity_file_import"],
      requiredScopes: ["workouts_read", "offline_data"],
      syncMode: "automatic",
    },
    completed_activity_export: {
      status: "unsupported",
      reason: "Wahoo completed activity export is not implemented.",
    },
    planned_activity_push: {
      status: "supported",
      operations: ["planned_activity_push"],
      requiredScopes: ["plans_read", "plans_write", "workouts_read", "workouts_write"],
      syncMode: "automatic",
    },
    route_push: {
      status: "unsupported",
      reason:
        "Wahoo route push is disabled because uncertain create outcomes cannot be reconciled under the documented API.",
    },
    webhook_activity_updates: {
      status: "supported",
      operations: ["webhook_activity_updates"],
      requiredScopes: [],
      syncMode: "automatic",
    },
  },
  runtimeOperations: [
    "oauth_authorization",
    "oauth_callback",
    "profile_enrichment",
    "activity_history_reconcile",
    "activity_file_import",
    "disconnect",
  ],
  actions: [
    { action: "disconnect", userFacing: true },
    {
      action: "sync_now",
      capability: "activity_history_read",
      userFacing: true,
    },
    {
      action: "refresh_setup_data",
      capability: "profile_enrichment_read",
      userFacing: false,
    },
  ],
  workerRequirements: [
    { operation: "activity_history_reconcile", worker: "wahoo-provider-sync" },
    { operation: "planned_activity_push", worker: "wahoo-provider-sync" },
    { operation: "webhook_activity_updates", worker: "wahoo-provider-sync" },
  ],
} as const satisfies ProviderManifest<
  "wahoo",
  "wahoo",
  OAuth2ProviderConnectionDescriptor,
  "server"
>;

export const stravaProviderManifest = {
  id: "strava",
  connectorId: "strava",
  defaultSourceId: "strava",
  connection: { kind: "oauth2" },
  execution: "server",
  label: "Strava",
  onboarding: {
    summary: "Import up to 90 days of private activity history from your Strava account.",
    evidence: { activityHistory: true, profileDetails: false },
  },
  plannedActivities: unavailablePlannedActivities,
  capabilities: {
    profile_enrichment_read: {
      status: "unsupported",
      reason: "Strava profile enrichment is not implemented.",
    },
    activity_history_read: {
      status: "supported",
      operations: ["activity_history_reconcile"],
      requiredScopes: ["activity:read_all"],
      syncMode: "manual",
    },
    activity_file_download: {
      status: "unsupported",
      reason: "Strava activities are imported from summaries and streams.",
    },
    activity_file_format_fit: {
      status: "unsupported",
      reason: "Strava does not provide FIT artifacts through this integration.",
    },
    completed_activity_export: {
      status: "supported",
      operations: ["completed_activity_export"],
      requiredScopes: ["activity:write"],
      syncMode: "manual",
    },
    planned_activity_push: {
      status: "unsupported",
      reason: "Strava planned activity delivery is not implemented.",
    },
    route_push: { status: "unsupported", reason: "Strava route delivery is not implemented." },
    webhook_activity_updates: {
      status: "supported",
      operations: ["webhook_activity_updates"],
      requiredScopes: [],
      syncMode: "automatic",
    },
  },
  runtimeOperations: [
    "oauth_authorization",
    "oauth_callback",
    "activity_history_reconcile",
    "completed_activity_export",
    "disconnect",
  ],
  actions: [
    { action: "disconnect", userFacing: true },
    {
      action: "sync_now",
      capability: "activity_history_read",
      userFacing: true,
    },
  ],
  workerRequirements: [
    { operation: "activity_history_reconcile", worker: "strava-provider-sync" },
    { operation: "completed_activity_export", worker: "strava-provider-sync" },
    { operation: "webhook_activity_updates", worker: "strava-provider-sync" },
  ],
} as const satisfies ProviderManifest<
  "strava",
  "strava",
  OAuth2ProviderConnectionDescriptor,
  "server"
>;

const providerCapabilityMap = {
  wahoo: wahooProviderManifest,
  strava: stravaProviderManifest,
} as const satisfies Record<ExecutableIntegrationProviderId, ProviderCapabilityDefinition>;

/** The single runtime-neutral registry for every executable connector. */
export const providerManifestRegistry = executableIntegrationProviderIdValues.map(
  (provider) => providerCapabilityMap[provider],
) satisfies readonly ProviderCapabilityDefinition[];

/** Compatibility export; provider manifests now own capability declarations. */
export const providerCapabilityRegistry = providerManifestRegistry;

export function certifyProviderManifestRegistry(
  manifests: readonly ProviderCapabilityDefinition[],
): void {
  if (manifests.length !== executableIntegrationProviderIdValues.length) {
    throw new Error("Provider manifest registry has missing or duplicate connectors");
  }
  const connectorIds = new Set(manifests.map((manifest) => manifest.connectorId));
  if (connectorIds.size !== manifests.length)
    throw new Error("Provider manifest registry has duplicate connectors");
  for (const connectorId of executableIntegrationProviderIdValues) {
    if (!connectorIds.has(connectorId))
      throw new Error("Provider manifest registry has a missing connector");
  }
  for (const manifest of manifests) {
    if (manifest.id !== manifest.connectorId) {
      throw new Error("Provider manifest id must equal connectorId");
    }
    if (!providerConnectionDescriptorSchema.safeParse(manifest.connection).success) {
      throw new Error("Provider manifest has an invalid connection descriptor");
    }
    if (!providerExecutionSchema.safeParse(manifest.execution).success) {
      throw new Error("Provider manifest has an invalid execution descriptor");
    }
    for (const capability of providerCapabilityValues) {
      const declaration = manifest.capabilities[capability];
      if (!declaration) throw new Error(`Provider manifest capability missing: ${capability}`);
      if (declaration.status === "supported" && declaration.operations.length === 0) {
        throw new Error(`Supported provider capability has no operations: ${capability}`);
      }
      if (declaration.status === "supported") {
        for (const operation of declaration.operations) {
          const covered =
            manifest.runtimeOperations.includes(operation) ||
            manifest.workerRequirements.some((worker) => worker.operation === operation);
          if (!covered) throw new Error(`Supported provider operation is uncovered: ${operation}`);
        }
      }
      if (declaration.status === "unsupported") {
        if (!declaration.reason.trim())
          throw new Error(`Unsupported provider capability has no reason: ${capability}`);
        if ("operations" in declaration) {
          throw new Error(`Unsupported provider capability declares operations: ${capability}`);
        }
      }
    }
    for (const worker of manifest.workerRequirements) {
      const required = providerCapabilityValues.some((capability) => {
        const declaration = manifest.capabilities[capability];
        return (
          declaration.status === "supported" && declaration.operations.includes(worker.operation)
        );
      });
      if (!required)
        throw new Error(`Provider worker requirement is unsupported: ${worker.operation}`);
    }
    const actions = new Set<ProviderConfigurableAction>();
    for (const action of manifest.actions) {
      if (actions.has(action.action)) {
        throw new Error(`Provider manifest action is duplicated: ${action.action}`);
      }
      actions.add(action.action);
      if (action.capability) {
        if (manifest.capabilities[action.capability].status !== "supported") {
          throw new Error(`Provider action capability is unsupported: ${action.capability}`);
        }
      } else if (action.action !== "disconnect") {
        throw new Error(`Provider action has no capability: ${action.action}`);
      }
    }
  }
}

certifyProviderManifestRegistry(providerManifestRegistry);

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
  return providerCapabilityMap[provider].capabilities[capability].status === "supported";
}

export function getProviderCapabilityUnavailableReason(
  provider: ExecutableIntegrationProviderId,
  capability: ProviderCapability,
): string | null {
  const declaration = getProviderCapabilityDefinition(provider).capabilities[capability];
  return declaration.status === "unsupported" ? declaration.reason : null;
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
  const declaration = getProviderCapabilityDefinition(provider).capabilities[capability];
  return declaration.status === "supported" ? (declaration.syncMode ?? "manual") : "unsupported";
}

export function getConfigurableProviderActions(
  provider: ExecutableIntegrationProviderId,
): ProviderConfigurableAction[] {
  return getProviderCapabilityDefinition(provider)
    .actions.filter((action) => action.userFacing)
    .map((action) => action.action);
}

export function getProviderActionAuthorization(
  provider: ExecutableIntegrationProviderId,
  action: ProviderConfigurableAction,
): ProviderActionAuthorization | null {
  return (
    getProviderCapabilityDefinition(provider).actions.find((entry) => entry.action === action) ??
    null
  );
}

export function providerActionIsAuthorized(input: {
  provider: ExecutableIntegrationProviderId;
  action: ProviderConfigurableAction;
  grantedScope: string | null | undefined;
}): boolean {
  const authorization = getProviderActionAuthorization(input.provider, input.action);
  if (!authorization) return false;
  return authorization.capability
    ? providerCapabilityIsAuthorized({
        provider: input.provider,
        capability: authorization.capability,
        grantedScope: input.grantedScope,
      })
    : authorization.action === "disconnect";
}

export function providerCapabilityIsAuthorized(input: {
  provider: ExecutableIntegrationProviderId;
  capability: ProviderCapability;
  grantedScope: string | null | undefined;
}): boolean {
  const declaration = getProviderCapabilityDefinition(input.provider).capabilities[
    input.capability
  ];
  if (declaration.status === "unsupported") return false;
  const granted = new Set((input.grantedScope ?? "").split(/[\s,]+/).filter(Boolean));
  return declaration.requiredScopes.every((scope) => granted.has(scope));
}

export function getProviderRequiredAuthorizationScopes(
  provider: ExecutableIntegrationProviderId,
): string[] {
  return Array.from(
    new Set(
      providerCapabilityValues.flatMap((capability) => {
        const declaration = getProviderCapabilityDefinition(provider).capabilities[capability];
        return declaration.status === "supported" ? declaration.requiredScopes : [];
      }),
    ),
  );
}

export function getProviderWorkerRequirements(
  provider: ExecutableIntegrationProviderId,
): readonly ProviderWorkerRequirement[] {
  return getProviderCapabilityDefinition(provider).workerRequirements;
}

export function getProviderRequiredOperationTokens(
  provider: ExecutableIntegrationProviderId,
): ProviderOperationToken[] {
  return Array.from(
    new Set(
      providerCapabilityValues.flatMap((capability) => {
        const declaration = getProviderCapabilityDefinition(provider).capabilities[capability];
        return declaration.status === "supported" ? declaration.operations : [];
      }),
    ),
  );
}

export function getProviderRuntimeOperationTokens(
  provider: ExecutableIntegrationProviderId,
): readonly ProviderOperationToken[] {
  return getProviderCapabilityDefinition(provider).runtimeOperations;
}

/** Static product target only; API runtime admission still owns enablement, grants, and fences. */
export function isProviderActivityHistoryReconciliationTarget(
  provider: ExecutableIntegrationProviderId,
): boolean {
  return providerHasCapability(provider, "activity_history_read");
}
