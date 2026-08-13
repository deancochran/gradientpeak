import { activityImportRuns, type DrizzleDbClient } from "@repo/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createWahooSyncRepository } from "../../infrastructure/repositories";
import {
  isWahooIntegrationEnabled,
  isWahooOAuthConfigured,
  requireWahooOAuthConfig,
} from "../../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../../lib/integrations/oauth-pkce";
import {
  createOAuthStateBinding,
  getOAuthCallbackUrl,
} from "../../lib/integrations/oauth-state-binding";
import { hasWahooPlannedActivityScopes } from "../../lib/integrations/wahoo/planned-activity-scopes";
import { enqueueWahooProfileEnrichment } from "../../lib/provider-sync/wahoo-profile-enrichment";
import { WahooProfileSetupService } from "../wahoo-profile-setup-service";
import { exchangeWahooOAuthCode, resolveWahooOAuthIdentity } from "./oauthCallbackUseCase";
import {
  type ProviderIntegrationOperationContext,
  type ProviderOperationAdapter,
  ProviderOperationUnavailableError,
  type ProviderOverviewEvidence,
} from "./provider-operation-registry";
import { enqueueWahooActivityHistoryReconcile, syncIntegrationNow } from "./syncNowUseCase";
import { admitWahooReconciliation } from "./wahoo-reconciliation-admission";

const work = {
  historyJobType: "wahoo.activity_history_reconcile",
  profileJobType: "wahoo.profile_enrichment",
} as const;
const plannedJobTypes = new Set(["wahoo.publish_event", "wahoo.unsync_event"]);
const resources = {
  activities: "historical_activities",
  profile: "profile_enrichment",
  planned: "planned_activities",
} as const;

function buildAuthorizationUrl(state: string, callbackUrl: string, returnUri: string) {
  const config = requireWahooOAuthConfig();
  const verifier = deriveOAuthCodeVerifier({
    clientSecret: config.clientSecret,
    provider: "wahoo",
    state,
  });
  const challenge = createOAuthCodeChallenge(verifier);
  if (config.adapter === "local-test") {
    const callback = new URL(callbackUrl);
    callback.searchParams.set(
      "code",
      issueLocalOAuthAuthorizationCode({ challenge, config, provider: "wahoo" }),
    );
    callback.searchParams.set("state", state);
    if (new URL(returnUri).protocol.startsWith("http"))
      callback.searchParams.set("test_return", "web");
    return callback.toString();
  }
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });
  if (config.pkce) {
    params.set("code_challenge", challenge);
    params.set("code_challenge_method", "S256");
  }
  return `${config.authUrl}?${params.toString()}`;
}

function safeError(value: string | null | undefined) {
  return value ? "Provider sync needs attention" : null;
}

async function readOverview(
  input:
    | ProviderIntegrationOperationContext<"wahoo">
    | { db: DrizzleDbClient; profileId: string; integration: null; scope: null },
): Promise<ProviderOverviewEvidence> {
  if (!input.integration) {
    return {
      activityHistory: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "idle",
        importRun: null,
      },
      plannedActivities: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        queuedJobId: null,
        status: "unsupported",
      },
      setupData: { lastError: null, lastFailedAt: null, lastSucceededAt: null, status: "idle" },
    };
  }
  const repository = createWahooSyncRepository({ db: input.db });
  const [states, jobs, importRuns] = await Promise.all([
    repository.listSyncStateByIntegrationIds([input.integration.id]).catch(() => []),
    repository
      .listJobs({ limit: 50, profileId: input.profileId, statuses: ["queued", "running"] })
      .catch(() => []),
    input.db
      .select()
      .from(activityImportRuns)
      .where(
        and(
          eq(activityImportRuns.profile_id, input.profileId),
          eq(activityImportRuns.integration_id, input.integration.id),
          inArray(activityImportRuns.kind, ["onboarding", "history_sync", "manual_sync"]),
        ),
      )
      .orderBy(desc(activityImportRuns.updated_at))
      .limit(1),
  ]);
  const state = (resource: string) => states.find((candidate) => candidate.resource === resource);
  const activityState = state(resources.activities);
  const setupState = state(resources.profile);
  const plannedState = state(resources.planned);
  const activityJob = jobs.find((job) => job.jobType === work.historyJobType);
  const plannedJob = jobs.find((job) => plannedJobTypes.has(job.jobType));
  const importRun = importRuns[0];
  const plannedGranted = hasWahooPlannedActivityScopes(input.scope);
  const activityError = safeError(activityState?.lastError);
  const setupError = safeError(setupState?.lastError);
  const plannedError = safeError(plannedState?.lastError);
  return {
    activityHistory: {
      lastError: activityError,
      lastFailedAt: activityState?.lastSyncFailedAt ?? null,
      lastSucceededAt: activityState?.lastSyncSucceededAt ?? null,
      queuedJobId: activityJob?.id ?? null,
      status:
        activityJob?.status === "running"
          ? "importing"
          : activityJob?.status === "queued"
            ? "queued"
            : activityError
              ? "failed"
              : activityState?.lastSyncSucceededAt
                ? "synced"
                : "idle",
      importRun: importRun
        ? {
            id: importRun.id,
            status: importRun.status,
            importedCount: importRun.imported_count,
            skippedCount: importRun.skipped_count,
            failedCount: importRun.failed_count,
          }
        : null,
    },
    plannedActivities: {
      lastError: plannedGranted
        ? plannedError
        : "Reconnect this account to grant planned activity permissions",
      lastFailedAt: plannedState?.lastSyncFailedAt ?? null,
      lastSucceededAt: plannedState?.lastSyncSucceededAt ?? null,
      queuedJobId: plannedJob?.id ?? null,
      status: !plannedGranted
        ? "unsupported"
        : plannedJob?.status === "running"
          ? "syncing"
          : plannedJob?.status === "queued"
            ? "queued"
            : plannedError
              ? "failed"
              : "automatic",
    },
    setupData: {
      lastError: setupError,
      lastFailedAt: setupState?.lastSyncFailedAt ?? null,
      lastSucceededAt: setupState?.lastSyncSucceededAt ?? null,
      status: setupError ? "failed" : setupState?.lastSyncSucceededAt ? "refreshed" : "idle",
    },
  };
}

function integrationCandidate(input: ProviderIntegrationOperationContext<"wahoo">) {
  return {
    generation: input.integration.generation,
    id: input.integration.id,
    lifecycle_status: input.integration.lifecycleStatus,
    profile_id: input.profileId,
    provider: input.integration.provider,
  };
}

export const wahooProviderOperationAdapter: ProviderOperationAdapter<"wahoo"> = {
  provider: "wahoo",
  isConfigured: isWahooIntegrationEnabled,
  isOAuthConfigured: isWahooOAuthConfigured,
  createOAuthAuthorization: ({ returnUri, state }) => {
    const config = requireWahooOAuthConfig();
    const callbackUrl = getOAuthCallbackUrl("wahoo");
    return {
      binding: createOAuthStateBinding({ config, provider: "wahoo", state }),
      url: buildAuthorizationUrl(state, callbackUrl, returnUri),
    };
  },
  exchangeOAuthCode: ({ code, state }) => exchangeWahooOAuthCode("wahoo", code, state),
  resolveOAuthIdentity: (tokens) => resolveWahooOAuthIdentity("wahoo", tokens),
  activateOAuthCredential: async (accessToken) => {
    const { activateWahooAccessToken } = await import("../../lib/integrations/wahoo/client");
    await activateWahooAccessToken(accessToken);
  },
  connectFailureCode: (detail) =>
    detail === "wahoo_token_limit_exceeded"
      ? "wahoo_token_limit_exceeded"
      : "token_exchange_failed",
  normalizeConnectFailure: (detail) =>
    detail === "wahoo_token_limit_exceeded"
      ? {
          code: "authorization_limit_reached",
          message:
            "This account has too many active GradientPeak authorizations. Revoke an older authorization with the provider, then try again.",
        }
      : { code: "connection_failed", message: "Integration connection failed" },
  readSetupEvidence: ({ db, profileId }) =>
    new WahooProfileSetupService({ db }).getSetupData(profileId),
  readOverviewEvidence: readOverview,
  syncNow: ({ db, profileId }) => syncIntegrationNow({ db, profileId, provider: "wahoo" }),
  refreshSetupEvidence: ({ db, profileId }) =>
    new WahooProfileSetupService({ db }).refreshSetupData(profileId, "wahoo"),
  disconnect: async ({ db, profileId }) => {
    await createWahooSyncRepository({ db }).requestWahooDisconnect({ profileId });
  },
  enqueueConnectedProfileWork: async (input) => {
    const admission = admitWahooReconciliation({
      integration: integrationCandidate(input),
      scope: input.scope,
      target: "profile_enrichment",
      trigger: "connect",
    });
    if (!admission.admitted) throw new ProviderOperationUnavailableError("wahoo");
    const repository = input.enqueueJob
      ? ({
          enqueueJobInTransaction: (_transaction: unknown, job: unknown) => input.enqueueJob?.(job),
        } as unknown as ReturnType<typeof createWahooSyncRepository>)
      : createWahooSyncRepository({ db: input.db });
    await enqueueWahooProfileEnrichment({
      admission,
      providerSyncRepository: repository,
      transaction: input.transaction,
    });
  },
  enqueueInitialOnboardingWork: async (input) => {
    const candidate = integrationCandidate(input);
    const history = admitWahooReconciliation({
      integration: candidate,
      scope: input.scope,
      target: "activity_history",
      trigger: "onboarding",
    });
    const profile = admitWahooReconciliation({
      integration: candidate,
      scope: input.scope,
      target: "profile_enrichment",
      trigger: "onboarding",
    });
    if (!history.admitted || !profile.admitted)
      throw new ProviderOperationUnavailableError("wahoo");
    const repository = createWahooSyncRepository({ db: input.db });
    const historyResult = await enqueueWahooActivityHistoryReconcile({
      admission: history,
      providerSyncRepository: repository,
      transaction: input.transaction,
    });
    const profileResult = await enqueueWahooProfileEnrichment({
      admission: profile,
      providerSyncRepository: repository,
      transaction: input.transaction,
    });
    if (!historyResult.jobId || !["queued", "running"].includes(profileResult.status))
      throw new ProviderOperationUnavailableError("wahoo");
    return { historyJobId: historyResult.jobId, profileJobId: profileResult.id ?? null };
  },
  admitOnboardingRetry: ({ profileId, work: anchored }) => {
    const input: ProviderIntegrationOperationContext<"wahoo"> = {
      db: {} as DrizzleDbClient,
      profileId,
      integration: {
        id: anchored.integrationId,
        generation: anchored.generation,
        provider: "wahoo",
        lifecycleStatus: anchored.active ? "active" : "disconnected",
      },
      scope: anchored.scope,
    };
    const candidate = integrationCandidate(input);
    const history = admitWahooReconciliation({
      integration: candidate,
      scope: anchored.scope,
      target: "activity_history",
      trigger: "onboarding",
    });
    const profile = admitWahooReconciliation({
      integration: candidate,
      scope: anchored.scope,
      target: "profile_enrichment",
      trigger: "onboarding",
    });
    if (!history.admitted || !profile.admitted)
      throw new ProviderOperationUnavailableError("wahoo");
    return work;
  },
  onboardingWork: work,
  identifyOnboardingWork: ({ jobs }) => {
    const history = jobs.find((job) => job.jobType === work.historyJobType);
    const profile = jobs.find((job) => job.jobType === work.profileJobType);
    return {
      historyJobId: history?.id ?? null,
      profileJobId: profile?.id ?? null,
      requiredJobTypes: [work.historyJobType, work.profileJobType],
      importRunLinked:
        history?.importRunId !== null && history?.importRunId === history?.payloadImportRunId,
    };
  },
  allowsAction: ({ action, grantedScope }) => {
    const scopes = new Set((grantedScope ?? "").split(/[\s,]+/).filter(Boolean));
    return (
      action === "disconnect" ||
      (action === "sync_now" && scopes.has("workouts_read") && scopes.has("offline_data")) ||
      (action === "refresh_setup_data" && scopes.has("user_read"))
    );
  },
};
