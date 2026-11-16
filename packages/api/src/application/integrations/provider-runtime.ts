import type {
  ExecutableIntegrationProviderId,
  ProviderConfigurableAction,
  ProviderExecution,
  ProviderIntegrationLifecycleStatus,
  ProviderManifest,
  ProviderOperationToken,
} from "@repo/core";
import type { DrizzleDbClient } from "@repo/db";
import type { DrizzleTransactionClient } from "../../db";

export type NormalizedProviderOAuthTokenResponse = {
  access_token: string;
  refresh_token?: string | null;
  expires_in?: number;
  scope?: string | null;
  athlete?: { id?: string | number | null } | null;
  user?: { id?: string | number | null } | null;
  userId?: string | number | null;
  id?: string | number | null;
};

export type ProviderSetupEvidence<TProvider extends string = string> = {
  profile: {
    dob: string | null;
    gender: "female" | "male" | "other" | null;
    onboarding_status: "provider_selection" | "processing" | "review" | "completed";
  };
  values: { dob?: string; gender?: "female" | "male" | "other"; weight_kg?: number };
  sources: Partial<
    Record<
      "dob" | "gender" | "weight_kg",
      { provider: TProvider; label: string; sourceRecordedAt: string | null }
    >
  >;
};

export type ProviderInitialWorkDescriptor = {
  historyJobType: string;
  profileJobType: string | null;
};

export type ProviderOAuthStateBinding = {
  callbackUri: string;
  requestedScope: string;
  verifierHash: string;
};

export type ProviderOAuthFailure = {
  kind: "exchange" | "identity";
  code: string;
  message: string;
  reason?: string;
};

export type ProviderOnboardingWorkRoles = {
  historyJobId: string | null;
  profileJobId: string | null;
  requiredJobTypes: readonly string[];
  importRunLinked: boolean;
};

export type CompletedActivityProviderEligibility = {
  jobId: string | null;
  provider: string;
  reason: string | null;
  status:
    | "ready"
    | "reconnect_required"
    | "unsupported_evidence"
    | "not_connected"
    | "unavailable"
    | "queued"
    | "running"
    | "completed"
    | "dispatch_uncertain"
    | "failed";
};

export type CompletedActivityProviderSendResult = {
  jobId: string | null;
  provider: string;
  status:
    | "queued"
    | "completed"
    | "reconnect_required"
    | "unsupported_evidence"
    | "not_connected"
    | "unavailable"
    | "dispatch_uncertain"
    | "failed";
};

export class CompletedActivityProviderNotFoundError extends Error {
  constructor() {
    super("Activity not found");
    this.name = CompletedActivityProviderNotFoundError.name;
  }
}

export type ProviderIntegrationRuntimeContext = {
  db: DrizzleDbClient;
  profileId: string;
  integration: {
    id: string;
    generation: number;
    lifecycleStatus: ProviderIntegrationLifecycleStatus;
  };
  scope: string | null;
};

export type ProviderTransactionalRuntimeContext = ProviderIntegrationRuntimeContext & {
  transaction: DrizzleTransactionClient;
  enqueueJob?: (input: unknown) => Promise<{ id: string; status: string }>;
};

export type ProviderAnchoredWork = {
  active: boolean;
  generation: number;
  integrationId: string;
  scope: string | null;
  jobs: Array<{ id: string; jobType: string; status: string }>;
};

export type ProviderOverviewEvidence = {
  activityHistory: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status: "idle" | "queued" | "importing" | "synced" | "failed" | "unsupported";
    importRun: {
      id: string;
      status: "queued" | "running" | "completed" | "failed" | "cancelled";
      importedCount: number;
      skippedCount: number;
      failedCount: number;
    } | null;
  };
  plannedActivities: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    queuedJobId: string | null;
    status:
      | "automatic"
      | "queued"
      | "syncing"
      | "failed"
      | "recovery_required"
      | "unsupported_projection"
      | "unsupported";
  };
  setupData: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    status: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
  };
};

export type ProviderAvailabilityRuntime = {
  isConfigured: () => boolean;
};

export type ProviderOAuthConnectionRuntime<TProvider extends string = string> = {
  kind: "oauth2";
  provider: TProvider;
  isOAuthConfigured: () => boolean;
  createOAuthAuthorization: (input: { returnUri: string; state: string }) => {
    binding: ProviderOAuthStateBinding;
    url: string;
  };
  validateOAuthStateBinding: (input: {
    binding: ProviderOAuthStateBinding;
    state: string;
  }) => boolean;
  exchangeOAuthCode: (input: {
    code: string;
    state: string;
  }) => Promise<NormalizedProviderOAuthTokenResponse>;
  resolveOAuthIdentity: (tokens: NormalizedProviderOAuthTokenResponse) => Promise<{
    externalId: string;
    requiresActivation: boolean;
    /** Provider-owned per-user grants, when they are distinct from requested OAuth scopes. */
    scope?: string;
  }>;
  activateOAuthCredential: (accessToken: string) => Promise<void>;
  classifyOAuthFailure: (error: unknown) => ProviderOAuthFailure;
};

export type ProviderConnectionRuntime<
  TProvider extends string = string,
  TDevicePermissionOperations extends object = Record<never, never>,
  TApiKeyOperations extends object = Record<never, never>,
  TFileImportOperations extends object = Record<never, never>,
> =
  | ProviderOAuthConnectionRuntime<TProvider>
  | { kind: "device_permissions"; provider: TProvider; operations: TDevicePermissionOperations }
  | { kind: "api_key"; provider: TProvider; operations: TApiKeyOperations }
  | { kind: "file_import"; provider: TProvider; operations: TFileImportOperations }
  | { kind: "none"; provider: TProvider };

export type ProviderExecutionRuntime<TServerComponent = never, TMobileComponent = never> =
  | { kind: "server"; server: TServerComponent; mobile?: never }
  | { kind: "mobile"; mobile: TMobileComponent; server?: never }
  | { kind: "hybrid"; server: TServerComponent; mobile: TMobileComponent };

export type ProviderConnectedProfileRuntime = {
  enqueueConnectedProfileWork: (input: ProviderTransactionalRuntimeContext) => Promise<void>;
};

export type ProviderSetupRuntime = {
  readSetupEvidence: (input: {
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<ProviderSetupEvidence<ExecutableIntegrationProviderId>>;
  refreshSetupEvidence: (input: { db: DrizzleDbClient; profileId: string }) => Promise<unknown>;
};

export type ProviderOverviewRuntime = {
  readOverviewEvidence: (
    input:
      | ProviderIntegrationRuntimeContext
      | { db: DrizzleDbClient; profileId: string; integration: null; scope: null },
  ) => Promise<ProviderOverviewEvidence>;
};

export type ProviderActionAuthorizationRuntime = {
  allowsAction: (input: {
    action: ProviderConfigurableAction;
    grantedScope: string | null | undefined;
  }) => boolean;
};

export type ProviderSynchronizationRuntime = {
  syncNow: (input: { db: DrizzleDbClient; profileId: string }) => Promise<unknown>;
};

export type ProviderDisconnectionRuntime = {
  /** Existing grants must remain removable after new connections are disabled. */
  availableWhenDisabled?: boolean;
  disconnect: (input: { db: DrizzleDbClient; profileId: string }) => Promise<void>;
};

export type ProviderCredentialRevocationRuntime = {
  deauthorizeAccessToken: (accessToken: string) => Promise<void>;
};

export type ProviderOnboardingRuntime = {
  enqueueInitialOnboardingWork: (
    input: ProviderTransactionalRuntimeContext,
  ) => Promise<{ historyJobId: string; profileJobId: string | null }>;
  admitOnboardingRetry: (input: {
    profileId: string;
    work: ProviderAnchoredWork;
  }) => ProviderInitialWorkDescriptor;
  onboardingWork: ProviderInitialWorkDescriptor;
  identifyOnboardingWork: (input: {
    jobs: Array<{
      id: string;
      importRunId: string | null;
      jobType: string;
      payloadImportRunId: string | null;
      status: string;
    }>;
  }) => ProviderOnboardingWorkRoles;
};

export type ProviderCompletedActivityExportRuntime = {
  readCompletedActivityUploadEligibility: (input: {
    activityId: string;
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<CompletedActivityProviderEligibility>;
  sendCompletedActivity: (input: {
    activityId: string;
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<CompletedActivityProviderSendResult>;
};

export type ProviderReviewedSourceMaterializationRuntime = {
  enqueueReviewedActivityMaterialization: (input: {
    db: DrizzleDbClient;
    integration: { generation: number; id: string };
    profileId: string;
    providerExternalId: string;
    sourceReferenceId: string;
    transaction: DrizzleTransactionClient;
  }) => Promise<{ id: string; status: string }>;
};

export type ProviderServerRuntimeComponents = {
  availability: ProviderAvailabilityRuntime;
  actionAuthorization: ProviderActionAuthorizationRuntime;
  connectedProfile?: ProviderConnectedProfileRuntime;
  setup?: ProviderSetupRuntime;
  overview: ProviderOverviewRuntime;
  synchronization?: ProviderSynchronizationRuntime;
  disconnection?: ProviderDisconnectionRuntime;
  credentialRevocation?: ProviderCredentialRevocationRuntime;
  onboarding?: ProviderOnboardingRuntime;
  completedActivityExport?: ProviderCompletedActivityExportRuntime;
  reviewedSourceMaterialization?: ProviderReviewedSourceMaterializationRuntime;
};

type RequireComponentWhenDeclared<
  TManifest extends ProviderManifest,
  TOperation extends ProviderOperationToken,
  TComponent extends keyof ProviderServerRuntimeComponents,
> = TOperation extends TManifest["runtimeOperations"][number]
  ? Required<Pick<ProviderServerRuntimeComponents, TComponent>>
  : Partial<Pick<ProviderServerRuntimeComponents, TComponent>>;

export type ServerRuntimeComponentsForManifest<TManifest extends ProviderManifest> = Pick<
  ProviderServerRuntimeComponents,
  "actionAuthorization" | "availability" | "overview"
> &
  RequireComponentWhenDeclared<TManifest, "oauth_callback", "connectedProfile"> &
  RequireComponentWhenDeclared<TManifest, "profile_enrichment", "setup"> &
  RequireComponentWhenDeclared<TManifest, "activity_history_reconcile", "synchronization"> &
  RequireComponentWhenDeclared<TManifest, "activity_history_reconcile", "onboarding"> &
  RequireComponentWhenDeclared<TManifest, "activity_file_import", "synchronization"> &
  RequireComponentWhenDeclared<TManifest, "completed_activity_export", "completedActivityExport"> &
  RequireComponentWhenDeclared<TManifest, "disconnect", "disconnection"> &
  Partial<
    Pick<ProviderServerRuntimeComponents, "credentialRevocation" | "reviewedSourceMaterialization">
  >;

type ConnectionRuntimeForManifest<
  TManifest extends ProviderManifest,
  TConnectionOperations extends object,
> = TManifest["connection"] extends { kind: "oauth2" }
  ? ProviderOAuthConnectionRuntime<TManifest["connectorId"]>
  : TManifest["connection"] extends { kind: "device_permissions" }
    ? Extract<
        ProviderConnectionRuntime<
          TManifest["connectorId"],
          TConnectionOperations,
          Record<never, never>,
          Record<never, never>
        >,
        { kind: "device_permissions" }
      >
    : TManifest["connection"] extends { kind: "api_key" }
      ? Extract<
          ProviderConnectionRuntime<
            TManifest["connectorId"],
            Record<never, never>,
            TConnectionOperations,
            Record<never, never>
          >,
          { kind: "api_key" }
        >
      : TManifest["connection"] extends { kind: "file_import" }
        ? Extract<
            ProviderConnectionRuntime<
              TManifest["connectorId"],
              Record<never, never>,
              Record<never, never>,
              TConnectionOperations
            >,
            { kind: "file_import" }
          >
        : Extract<ProviderConnectionRuntime<TManifest["connectorId"]>, { kind: "none" }>;

type ExecutionRuntimeForManifest<
  TExecution extends ProviderExecution,
  TServerComponent,
  TMobileComponent,
> = Extract<ProviderExecutionRuntime<TServerComponent, TMobileComponent>, { kind: TExecution }>;

export type ComposedProviderRuntime<
  TManifest extends ProviderManifest = ProviderManifest,
  TConnectionOperations extends object = Record<never, never>,
  TServerComponent = never,
  TMobileComponent = never,
> = {
  provider: TManifest["connectorId"];
  manifest: TManifest;
  connection: ConnectionRuntimeForManifest<TManifest, TConnectionOperations>;
  execution: ExecutionRuntimeForManifest<
    TManifest["execution"],
    TServerComponent,
    TMobileComponent
  >;
};

export type OAuthServerProviderRuntime<
  TManifest extends ProviderManifest<
    ExecutableIntegrationProviderId,
    string,
    { kind: "oauth2" },
    "server"
  >,
> = ComposedProviderRuntime<
  TManifest,
  Record<never, never>,
  ServerRuntimeComponentsForManifest<TManifest>
>;

export function createComposedProviderRuntimeRegistry<
  TProvider extends string,
  TRuntime extends {
    provider: TProvider;
    connection: ProviderConnectionRuntime<TProvider, object, object, object>;
  },
>(runtimes: readonly TRuntime[]) {
  const byProvider = new Map<TProvider, TRuntime>(
    runtimes.map((runtime) => [runtime.provider, runtime]),
  );
  return {
    all: () => runtimes,
    get: (provider: TProvider) => byProvider.get(provider) ?? null,
    getOAuth(provider: TProvider) {
      const runtime = byProvider.get(provider);
      return runtime?.connection.kind === "oauth2" ? runtime : null;
    },
  };
}

const serverComponentRequirements = {
  oauth_authorization: null,
  oauth_callback: "connectedProfile",
  profile_enrichment: "setup",
  activity_history_reconcile: "synchronization",
  activity_file_import: "synchronization",
  completed_activity_export: "completedActivityExport",
  disconnect: "disconnection",
  planned_activity_push: null,
  webhook_activity_updates: null,
} as const satisfies Record<ProviderOperationToken, keyof ProviderServerRuntimeComponents | null>;

export function certifyComposedProviderRuntimeRegistry(
  manifests: readonly ProviderManifest[],
  runtimes: readonly {
    provider: string;
    manifest: ProviderManifest;
    connection: { kind: string; provider: string };
    execution: { kind: string; server?: object };
  }[],
): void {
  const runtimesByProvider = new Map(runtimes.map((runtime) => [runtime.provider, runtime]));
  if (runtimesByProvider.size !== runtimes.length) {
    throw new Error("Composed provider runtime registry has duplicate connectors");
  }
  if (runtimes.length !== manifests.length) {
    throw new Error("Composed provider runtime registry has missing or extra connectors");
  }
  for (const manifest of manifests) {
    const runtime = runtimesByProvider.get(manifest.connectorId);
    if (!runtime) throw new Error(`Composed provider runtime is missing: ${manifest.connectorId}`);
    if (
      runtime.manifest.connectorId !== manifest.connectorId ||
      runtime.connection.provider !== manifest.connectorId
    ) {
      throw new Error(`Composed provider runtime connector mismatch: ${manifest.connectorId}`);
    }
    if (runtime.connection.kind !== manifest.connection.kind) {
      throw new Error(`Composed provider runtime connection mismatch: ${manifest.connectorId}`);
    }
    if (runtime.execution.kind !== manifest.execution) {
      throw new Error(`Composed provider runtime execution mismatch: ${manifest.connectorId}`);
    }
    if (manifest.execution !== "server") continue;
    const components = runtime.execution.server;
    if (!components) throw new Error(`Provider server runtime is missing: ${manifest.connectorId}`);
    for (const operation of manifest.runtimeOperations) {
      const requiredComponent = serverComponentRequirements[operation];
      if (requiredComponent && !(requiredComponent in components)) {
        throw new Error(`Provider runtime is missing ${operation} component: ${requiredComponent}`);
      }
    }
    if (
      manifest.runtimeOperations.includes("activity_history_reconcile") &&
      !("onboarding" in components)
    ) {
      throw new Error(
        `Provider runtime is missing activity_history_reconcile component: onboarding`,
      );
    }
  }
}

export class ProviderRuntimeUnavailableError extends Error {
  constructor(public readonly provider: string) {
    super("Provider integration is not executable on this server");
    this.name = ProviderRuntimeUnavailableError.name;
  }
}

export const unsupportedProviderOverviewEvidence: ProviderOverviewEvidence = {
  activityHistory: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "unsupported",
    importRun: null,
  },
  plannedActivities: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "unsupported",
  },
  setupData: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    status: "unsupported",
  },
};
