import {
  providerActionIsAuthorized,
  providerCapabilityIsAuthorized,
  stravaProviderManifest,
} from "@repo/core";
import { type DrizzleDbClient, profiles, schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { createStravaRepository } from "../../infrastructure/repositories";
import {
  getStravaUploadExternalIdSecret,
  isStravaCompletedActivityUploadConfigured,
  isStravaIntegrationEnabled,
  isStravaOAuthConfigured,
  requireStravaOAuthConfig,
} from "../../lib/integrations/oauth-config";
import {
  createOAuthStateBinding,
  getOAuthCallbackUrl,
} from "../../lib/integrations/oauth-state-binding";
import {
  classifyStravaOAuthFailure,
  deauthorizeStravaAccessToken,
  exchangeStravaOAuthCode,
  resolveStravaOAuthIdentity,
  type StravaOAuthTokenResponse,
} from "../../lib/integrations/strava/oauth";
import { createStravaCompletedActivityExternalId } from "../../lib/integrations/strava/upload";
import type { EnqueueStravaSyncJobInput } from "../../repositories";
import { withOpenIntegrationManagementTransaction } from "./onboarding-integration-gate";
import type {
  NormalizedProviderOAuthTokenResponse,
  OAuthServerProviderRuntime,
  ProviderIntegrationRuntimeContext,
  ProviderOverviewEvidence,
  ProviderTransactionalRuntimeContext,
} from "./provider-runtime";
import {
  CompletedActivityProviderNotFoundError,
  ProviderRuntimeUnavailableError,
} from "./provider-runtime";

export const STRAVA_ACTIVITY_HISTORY_JOB = "strava.activity_history_reconcile";
const onboardingWork = {
  historyJobType: STRAVA_ACTIVITY_HISTORY_JOB,
  profileJobType: null,
} as const;

function hasHistoryScope(scope: string | null | undefined): boolean {
  return providerCapabilityIsAuthorized({
    provider: "strava",
    capability: "activity_history_read",
    grantedScope: scope,
  });
}

function uploadEligibilityReason(status: string): string | null {
  if (status === "ready") return null;
  if (status === "queued") return "Strava upload is queued.";
  if (status === "running") return "Activity is being sent to Strava.";
  if (status === "completed") return "Activity was sent to Strava.";
  if (status === "dispatch_uncertain") {
    return "Strava upload outcome is uncertain; it will not be retried automatically.";
  }
  if (status === "failed") return "Strava upload failed.";
  if (status === "reconnect_required") {
    return "Reconnect Strava to grant activity upload access.";
  }
  if (status === "unsupported_evidence") {
    return "A current accepted FIT, TCX, or GPX source file is required.";
  }
  if (status === "not_connected") return "Connect Strava to send completed activities.";
  return "Completed activity delivery is unavailable.";
}

async function readCompletedActivityUploadEligibility(input: {
  activityId: string;
  db: DrizzleDbClient;
  profileId: string;
}) {
  if (!isStravaCompletedActivityUploadConfigured()) {
    return {
      jobId: null,
      provider: "strava" as const,
      reason: uploadEligibilityReason("unavailable"),
      status: "unavailable" as const,
    };
  }
  const state = await createStravaRepository({ db: input.db }).readCompletedActivityUploadState(
    input,
  );
  if (state.status === "activity_not_found") {
    throw new CompletedActivityProviderNotFoundError();
  }
  return {
    jobId: state.jobId,
    provider: "strava" as const,
    reason: uploadEligibilityReason(state.status),
    status: state.status,
  };
}

async function sendCompletedActivity(input: {
  activityId: string;
  db: DrizzleDbClient;
  profileId: string;
}) {
  if (!isStravaCompletedActivityUploadConfigured()) {
    return { jobId: null, provider: "strava" as const, status: "unavailable" as const };
  }
  const repository = createStravaRepository({ db: input.db });
  const target = await repository.readCompletedActivityUploadTarget(input);
  if (target.status === "activity_not_found") {
    throw new CompletedActivityProviderNotFoundError();
  }
  if (target.status !== "ready") {
    return { jobId: null, provider: "strava" as const, status: target.status };
  }
  const secret = getStravaUploadExternalIdSecret();
  if (!secret) {
    return { jobId: null, provider: "strava" as const, status: "unavailable" as const };
  }
  const externalId = createStravaCompletedActivityExternalId({
    activityId: input.activityId,
    artifactRevision: target.artifact.digest,
    destination: `strava:${target.integrationId}:${target.integrationGeneration}`,
    profileId: input.profileId,
    secret,
  });
  try {
    const job = await repository.enqueueCompletedActivityUpload({
      activityId: input.activityId,
      artifact: target.artifact,
      externalId,
      integrationGeneration: target.integrationGeneration,
      integrationId: target.integrationId,
      profileId: input.profileId,
    });
    const terminalState =
      !job.created && job.status === "dead_lettered"
        ? await repository.readCompletedActivityUploadState(input)
        : null;
    const status = job.created
      ? ("queued" as const)
      : job.status === "completed"
        ? ("completed" as const)
        : job.status === "dead_lettered"
          ? terminalState?.status === "dispatch_uncertain"
            ? ("dispatch_uncertain" as const)
            : ("failed" as const)
          : job.status === "queued" || job.status === "running" || job.status === "failed"
            ? ("queued" as const)
            : ("failed" as const);
    return { jobId: job.id, provider: "strava" as const, status };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "strava_completed_activity_upload_target_changed"
    ) {
      const refreshed = await repository.readCompletedActivityUploadTarget(input);
      if (refreshed.status === "activity_not_found") {
        throw new CompletedActivityProviderNotFoundError();
      }
      return {
        jobId: null,
        provider: "strava" as const,
        status: refreshed.status === "ready" ? ("failed" as const) : refreshed.status,
      };
    }
    throw error;
  }
}

function historyJobInput(input: {
  generation: number;
  integrationId: string;
  profileId: string;
  trigger: "connect" | "manual" | "onboarding";
  activityExternalId?: string;
  reviewSourceReferenceId?: string;
}): EnqueueStravaSyncJobInput {
  return {
    dedupeKey: input.reviewSourceReferenceId
      ? `strava-review:${input.integrationId}:${input.generation}:${input.reviewSourceReferenceId}`
      : `strava-history:${input.integrationId}:${input.generation}`,
    integrationGeneration: input.generation,
    integrationId: input.integrationId,
    jobType: STRAVA_ACTIVITY_HISTORY_JOB,
    payload: {
      trigger: input.trigger,
      ...(input.activityExternalId ? { activityExternalId: input.activityExternalId } : {}),
      ...(input.reviewSourceReferenceId
        ? { reviewSourceReferenceId: input.reviewSourceReferenceId }
        : {}),
    },
    profileId: input.profileId,
    provider: "strava",
    resourceKind: "activity",
    runAt: new Date().toISOString(),
    syncLaneKey: `strava:${input.integrationId}:activity-history`,
  };
}

async function enqueueHistory(
  input: ProviderTransactionalRuntimeContext,
  trigger: "connect" | "manual" | "onboarding",
) {
  if (input.integration.lifecycleStatus !== "active" || !hasHistoryScope(input.scope)) {
    throw new ProviderRuntimeUnavailableError("strava");
  }
  const jobInput = historyJobInput({
    generation: input.integration.generation,
    integrationId: input.integration.id,
    profileId: input.profileId,
    trigger,
  });
  const result = input.enqueueJob
    ? await input.enqueueJob(jobInput)
    : await createStravaRepository({ db: input.db }).enqueueJobInTransaction(
        input.transaction,
        jobInput,
      );
  return result;
}

async function syncNow(input: { db: DrizzleDbClient; profileId: string }) {
  return withOpenIntegrationManagementTransaction({
    db: input.db,
    profileId: input.profileId,
    operation: async (transaction) => {
      const [row] = await transaction
        .select({ integration: schema.integrations, scope: schema.integrationCredentials.scope })
        .from(schema.integrations)
        .innerJoin(
          schema.integrationCredentials,
          eq(schema.integrationCredentials.integration_id, schema.integrations.id),
        )
        .where(
          and(
            eq(schema.integrations.profile_id, input.profileId),
            eq(schema.integrations.provider, "strava"),
            eq(schema.integrations.lifecycle_status, "active"),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
      if (!hasHistoryScope(row.scope)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Reconnect Strava to grant private activity history access",
        });
      }
      const repository = createStravaRepository({ db: input.db });
      const job = await repository.enqueueJobInTransaction(
        transaction,
        historyJobInput({
          generation: row.integration.generation,
          integrationId: row.integration.id,
          profileId: input.profileId,
          trigger: "manual",
        }),
      );
      return { jobId: job.id, queued: job.status === "queued" };
    },
  });
}

function normalizeTokens(tokens: StravaOAuthTokenResponse): NormalizedProviderOAuthTokenResponse {
  const expiresAtMs = tokens.expires_at * 1_000;
  const expiresIn = Math.min(tokens.expires_in, Math.floor((expiresAtMs - Date.now()) / 1_000));
  if (expiresIn <= 0) throw new Error("Strava returned an expired access token");
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: expiresIn,
    ...(tokens.scope === undefined ? {} : { scope: tokens.scope }),
    ...(tokens.athlete === undefined ? {} : { athlete: { id: tokens.athlete.id } }),
  };
}

async function readOverview(
  input:
    | ProviderIntegrationRuntimeContext
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
      setupData: {
        lastError: null,
        lastFailedAt: null,
        lastSucceededAt: null,
        status: "unsupported",
      },
    };
  }
  const repository = createStravaRepository({ db: input.db });
  const [state, jobs] = await Promise.all([
    repository.readHistorySyncState(input.integration.id),
    repository.listActiveJobs({ profileId: input.profileId }),
  ]);
  const job = jobs.find((candidate) => candidate.jobType === STRAVA_ACTIVITY_HISTORY_JOB);
  return {
    activityHistory: {
      lastError: state?.lastError ? "Provider sync needs attention" : null,
      lastFailedAt: state?.lastFailedAt ?? null,
      lastSucceededAt: state?.lastSucceededAt ?? null,
      queuedJobId: job?.id ?? null,
      status:
        job?.status === "running"
          ? "importing"
          : job?.status === "queued"
            ? "queued"
            : state?.lastError
              ? "failed"
              : state?.lastSucceededAt
                ? "synced"
                : "idle",
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
}

export const stravaProviderRuntime: OAuthServerProviderRuntime<typeof stravaProviderManifest> = {
  provider: "strava",
  manifest: stravaProviderManifest,
  connection: {
    kind: "oauth2",
    provider: "strava",
    isOAuthConfigured: isStravaOAuthConfigured,
    createOAuthAuthorization: ({ state }) => {
      const config = requireStravaOAuthConfig();
      const callbackUrl = getOAuthCallbackUrl("strava");
      const params = new URLSearchParams({
        approval_prompt: "auto",
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: config.scopes.join(","),
        state,
      });
      return {
        binding: createOAuthStateBinding({ config, provider: "strava", state }),
        url: `${config.authUrl}?${params.toString()}`,
      };
    },
    validateOAuthStateBinding: ({ binding, state }) => {
      const expected = createOAuthStateBinding({
        config: requireStravaOAuthConfig(),
        provider: "strava",
        state,
      });
      return (
        binding.callbackUri === expected.callbackUri &&
        binding.requestedScope === expected.requestedScope &&
        binding.verifierHash === expected.verifierHash
      );
    },
    exchangeOAuthCode: async ({ code }) => normalizeTokens(await exchangeStravaOAuthCode(code)),
    resolveOAuthIdentity: async (tokens) =>
      resolveStravaOAuthIdentity({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? "",
        token_type: "Bearer",
        expires_at: Math.floor(Date.now() / 1_000) + (tokens.expires_in ?? 1),
        expires_in: tokens.expires_in ?? 1,
        ...(tokens.scope == null ? {} : { scope: tokens.scope }),
        ...(tokens.athlete?.id == null ? {} : { athlete: { id: tokens.athlete.id } }),
      }),
    activateOAuthCredential: async () => undefined,
    classifyOAuthFailure: classifyStravaOAuthFailure,
  },
  execution: {
    kind: "server",
    server: {
      availability: { isConfigured: isStravaIntegrationEnabled },
      actionAuthorization: {
        allowsAction: ({ action, grantedScope }) =>
          providerActionIsAuthorized({ provider: "strava", action, grantedScope }),
      },
      overview: { readOverviewEvidence: readOverview },
      synchronization: { syncNow },
      completedActivityExport: {
        readCompletedActivityUploadEligibility,
        sendCompletedActivity,
      },
      reviewedSourceMaterialization: {
        enqueueReviewedActivityMaterialization: async (input) =>
          createStravaRepository({ db: input.db }).enqueueJobInTransaction(
            input.transaction,
            historyJobInput({
              activityExternalId: input.providerExternalId,
              generation: input.integration.generation,
              integrationId: input.integration.id,
              profileId: input.profileId,
              reviewSourceReferenceId: input.sourceReferenceId,
              trigger: "manual",
            }),
          ),
      },
      credentialRevocation: { deauthorizeAccessToken: deauthorizeStravaAccessToken },
      disconnection: {
        disconnect: async ({ db, profileId }) => {
          await createStravaRepository({ db }).requestProviderDisconnect({
            profileId,
            provider: "strava",
          });
        },
      },
      connectedProfile: {
        enqueueConnectedProfileWork: async (input) => {
          const [profile] = await input.transaction
            .select({ onboardingStatus: profiles.onboarding_status })
            .from(profiles)
            .where(eq(profiles.id, input.profileId))
            .limit(1);
          // Initial onboarding owns its history job after provider selection commits. Avoid racing
          // a generic connect import against that durable onboarding work-set anchor.
          if (profile?.onboardingStatus === "provider_selection") return;
          await enqueueHistory(input, "connect");
        },
      },
      onboarding: {
        enqueueInitialOnboardingWork: async (input) => {
          const job = await enqueueHistory(input, "onboarding");
          return { historyJobId: job.id, profileJobId: null };
        },
        admitOnboardingRetry: ({ work }) => {
          if (!work.active || !hasHistoryScope(work.scope)) {
            throw new ProviderRuntimeUnavailableError("strava");
          }
          return onboardingWork;
        },
        onboardingWork,
        identifyOnboardingWork: ({ jobs }) => {
          const history = jobs.find((job) => job.jobType === STRAVA_ACTIVITY_HISTORY_JOB);
          return {
            historyJobId: history?.id ?? null,
            profileJobId: null,
            requiredJobTypes: [STRAVA_ACTIVITY_HISTORY_JOB],
            importRunLinked:
              history?.importRunId !== null && history?.importRunId === history?.payloadImportRunId,
          };
        },
      },
    },
  },
};
