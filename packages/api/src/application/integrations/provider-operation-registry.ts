import type { ProviderIntegrationLifecycleStatus } from "@repo/core";
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

export type ProviderSetupEvidence<TProvider extends string> = {
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

export type ProviderIntegrationOperationContext<TProvider extends string> = {
  db: DrizzleDbClient;
  profileId: string;
  integration: {
    id: string;
    generation: number;
    provider: TProvider;
    lifecycleStatus: ProviderIntegrationLifecycleStatus;
  };
  scope: string | null;
};

export type ProviderTransactionalOperationContext<TProvider extends string> =
  ProviderIntegrationOperationContext<TProvider> & {
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
    status: "automatic" | "queued" | "syncing" | "failed" | "unsupported";
  };
  setupData: {
    lastError: string | null;
    lastFailedAt: string | null;
    lastSucceededAt: string | null;
    status: "idle" | "refreshing" | "refreshed" | "failed" | "unsupported";
  };
};

export type ProviderOperationAdapter<TProvider extends string> = {
  provider: TProvider;
  isConfigured: () => boolean;
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
  }>;
  activateOAuthCredential: (accessToken: string) => Promise<void>;
  /** Remote protocol only; universal lifecycle persistence remains repository-owned. */
  deauthorizeAccessToken?: (accessToken: string) => Promise<void>;
  classifyOAuthFailure: (error: unknown) => ProviderOAuthFailure;
  readSetupEvidence: (input: {
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<ProviderSetupEvidence<TProvider>>;
  readOverviewEvidence: (
    input:
      | ProviderIntegrationOperationContext<TProvider>
      | { db: DrizzleDbClient; profileId: string; integration: null; scope: null },
  ) => Promise<ProviderOverviewEvidence>;
  syncNow: (input: { db: DrizzleDbClient; profileId: string }) => Promise<unknown>;
  readCompletedActivityUploadEligibility?: (input: {
    activityId: string;
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<CompletedActivityProviderEligibility>;
  sendCompletedActivity?: (input: {
    activityId: string;
    db: DrizzleDbClient;
    profileId: string;
  }) => Promise<CompletedActivityProviderSendResult>;
  /** Queue a durable, provider-owned refetch after an owner explicitly keeps a reviewed source separate. */
  enqueueReviewedActivityMaterialization?: (input: {
    db: DrizzleDbClient;
    integration: { generation: number; id: string };
    profileId: string;
    providerExternalId: string;
    sourceReferenceId: string;
    transaction: DrizzleTransactionClient;
  }) => Promise<{ id: string; status: string }>;
  refreshSetupEvidence: (input: { db: DrizzleDbClient; profileId: string }) => Promise<unknown>;
  disconnect: (input: { db: DrizzleDbClient; profileId: string }) => Promise<void>;
  enqueueConnectedProfileWork: (
    input: ProviderTransactionalOperationContext<string>,
  ) => Promise<void>;
  enqueueInitialOnboardingWork: (
    input: ProviderTransactionalOperationContext<TProvider>,
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
  allowsAction: (input: { action: string; grantedScope: string | null | undefined }) => boolean;
};

export function createProviderOperationRegistry<
  TProvider extends string,
  TAdapter extends { provider: TProvider; isConfigured: () => boolean },
>(adapters: readonly TAdapter[]) {
  const byProvider = new Map<TProvider, TAdapter>(
    adapters.map((adapter) => [adapter.provider, adapter]),
  );
  return {
    configured: () => adapters.filter((adapter) => adapter.isConfigured()),
    get: (provider: TProvider) => byProvider.get(provider) ?? null,
    require(provider: TProvider) {
      const adapter = byProvider.get(provider);
      if (!adapter || !adapter.isConfigured())
        throw new ProviderOperationUnavailableError(provider);
      return adapter;
    },
  };
}

export class ProviderOperationUnavailableError extends Error {
  constructor(public readonly provider: string) {
    super("Provider integration is not executable on this server");
    this.name = ProviderOperationUnavailableError.name;
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
