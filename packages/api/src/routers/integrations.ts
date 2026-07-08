import {
  getConfigurableProviderActions,
  getProviderCapabilityDefinition,
  providerCapabilityRegistry,
  providerHasCapability,
} from "@repo/core";
import {
  type PublicIntegrationProvider,
  publicIntegrationProviderSchema,
  publicIntegrationsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { OnboardingProviderEnrichmentService } from "../application/onboarding-provider-enrichment";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import {
  createIntegrationsRepositories,
  createProviderSyncRepository,
} from "../infrastructure/repositories";
import { logger } from "../lib/logger";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const providerSchema = publicIntegrationProviderSchema;

const strictSuccessSchema = z.object({ success: z.literal(true) }).strict();

const activityHistoryResource = "historical_activities";
const profileEnrichmentResource = "profile_enrichment";
const plannedWorkoutsResource = "planned_workouts";
const wahooActivityHistoryJobType = "wahoo.activity_history_reconcile";
const wahooPlannedWorkoutJobTypes = new Set(["wahoo.publish_event", "wahoo.unsync_event"]);

const integrationRowSchema = publicIntegrationsRowSchema;

const authUrlResultSchema = z
  .object({
    url: z.string().url(),
    state: z.string().uuid(),
  })
  .strict();

const validateOAuthStateInputSchema = z
  .object({
    state: z.string().uuid(),
  })
  .strict();

const oauthStateRepositoryRowSchema = z
  .object({
    profile_id: z.string().uuid(),
    provider: providerSchema,
    mobile_redirect_uri: z.string().min(1),
    created_at: z.date(),
  })
  .passthrough();

const validatedOAuthStateResultSchema = z
  .object({
    userId: z.string().uuid(),
    provider: providerSchema,
    mobileRedirectUri: z.string().min(1),
    createdAt: z.string().datetime(),
  })
  .strict();

const storeIntegrationInputSchema = z
  .object({
    userId: z.string().uuid(),
    provider: providerSchema,
    externalId: z.string().min(1),
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1).nullable(),
    expiresAt: z.string().datetime().nullable(),
    scope: z.string().min(1).nullable(),
    state: z.string().uuid(),
  })
  .strict();

const deleteOAuthStateInputSchema = z
  .object({
    state: z.string().uuid(),
  })
  .strict();

const syncNowInputSchema = z
  .object({
    provider: providerSchema,
  })
  .strict();

const syncNowResultSchema = z
  .object({
    jobId: z.string().uuid().nullable(),
    queued: z.boolean(),
    setupRefresh: z
      .object({
        fieldsFilled: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
        fieldsKept: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
        fieldsUpdated: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
        keptExistingValues: z.boolean(),
        status: z.enum(["succeeded", "partial", "failed"]),
      })
      .nullable(),
  })
  .strict();

const syncOverviewSchema = z.array(
  z
    .object({
      actions: z.array(z.enum(["refresh_setup_data", "sync_now", "disconnect"])),
      activityHistory: z
        .object({
          lastError: z.string().nullable(),
          lastFailedAt: z.string().nullable(),
          lastSucceededAt: z.string().nullable(),
          queuedJobId: z.string().uuid().nullable(),
          status: z.enum(["idle", "queued", "importing", "synced", "failed", "unsupported"]),
        })
        .strict(),
      plannedWorkouts: z
        .object({
          lastError: z.string().nullable(),
          lastFailedAt: z.string().nullable(),
          lastSucceededAt: z.string().nullable(),
          queuedJobId: z.string().uuid().nullable(),
          status: z.enum(["automatic", "queued", "syncing", "failed", "unsupported"]),
        })
        .strict(),
      providerHealth: z
        .object({
          lastError: z.string().nullable(),
          status: z.enum(["connected", "needs_reconnect", "unsupported"]),
        })
        .strict(),
      setupData: z
        .object({
          lastError: z.string().nullable(),
          lastFailedAt: z.string().nullable(),
          lastSucceededAt: z.string().nullable(),
          status: z.enum(["idle", "refreshing", "refreshed", "failed", "unsupported"]),
        })
        .strict(),
      connected: z.boolean(),
      integrationId: z.string().uuid().nullable(),
      label: z.string().min(1),
      provider: providerSchema,
    })
    .strict(),
);

function parseBoundaryValue<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);

  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message,
      cause: parsed.error,
    });
  }

  return parsed.data;
}

async function readProviderSyncOverviewState(
  providerSyncRepository: ReturnType<typeof createProviderSyncRepository>,
  integrationIds: string[],
) {
  try {
    return await providerSyncRepository.listSyncStateByIntegrationIds(integrationIds);
  } catch (error) {
    logger.warn("Failed to read provider sync state for integrations overview", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

async function readActiveProviderSyncJobs(
  providerSyncRepository: ReturnType<typeof createProviderSyncRepository>,
  profileId: string,
) {
  try {
    return await providerSyncRepository.listJobs({
      limit: 50,
      profileId,
      statuses: ["queued", "running"],
    });
  } catch (error) {
    logger.warn("Failed to read provider sync jobs for integrations overview", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return [];
  }
}

function isProviderSyncPersistenceUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("provider_sync_jobs") ||
    message.includes("provider_sync_state") ||
    message.includes("Failed query")
  );
}

function getIntegrationsRepositories(ctx: Context) {
  return createIntegrationsRepositories(getRequiredDb(ctx));
}

function supportsActivityHistorySync(provider: PublicIntegrationProvider): boolean {
  return (
    providerHasCapability(provider, "activity_history_read") &&
    providerHasCapability(provider, "activity_file_download")
  );
}

function getSyncMetadataStatus(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || !("status" in metadata)) return null;
  const status = metadata.status;
  return typeof status === "string" ? status : null;
}

function looksLikeReconnectError(error: string | null | undefined): boolean {
  if (!error) return false;
  const normalized = error.toLowerCase();
  return (
    normalized.includes("unauthorized") ||
    normalized.includes("401") ||
    normalized.includes("invalid token") ||
    normalized.includes("expired") ||
    normalized.includes("refresh token")
  );
}

async function enqueueActivityHistoryReconcile(input: {
  integrationId: string;
  profileId: string;
  provider: PublicIntegrationProvider;
  providerSyncRepository: ReturnType<typeof createProviderSyncRepository>;
  trigger: "connect" | "manual";
}) {
  if (input.provider !== "wahoo" || !supportsActivityHistorySync(input.provider)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Activity history sync is not available for this provider",
    });
  }

  let job: { id: string; status: string };
  try {
    job = await input.providerSyncRepository.enqueueJob({
      dedupeKey: `provider-history-reconcile:${input.integrationId}:activity`,
      integrationId: input.integrationId,
      jobType: wahooActivityHistoryJobType,
      payload: {
        trigger: input.trigger,
        windowMonths: 12,
      },
      profileId: input.profileId,
      provider: "wahoo",
      resourceKind: "activity",
      runAt: new Date().toISOString(),
    });
  } catch (error) {
    if (!isProviderSyncPersistenceUnavailable(error)) {
      throw error;
    }

    logger.warn("Provider sync jobs are unavailable; skipping activity history enqueue", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return {
      jobId: null,
      queued: false,
    };
  }

  return {
    jobId: job.id,
    queued: job.status === "queued",
  };
}

async function refreshProviderSetupForSyncNow(input: {
  profileId: string;
  provider: PublicIntegrationProvider;
  service: OnboardingProviderEnrichmentService;
}) {
  if (!providerHasCapability(input.provider, "profile_enrichment_read")) return null;

  const result = await input.service.refreshSetupData(input.profileId, input.provider);
  return {
    fieldsFilled: result.fieldsFilled,
    fieldsKept: result.fieldsKept,
    fieldsUpdated: result.fieldsUpdated,
    keptExistingValues: result.keptExistingValues,
    status: result.status,
  };
}

const getAuthUrlInputSchema = z
  .object({
    provider: providerSchema,
    redirectUri: z.string().url().optional(), // Mobile app provides its redirect URI
  })
  .strict();

const disconnectInputSchema = z
  .object({
    provider: providerSchema,
  })
  .strict();

export const integrationsRouter = createTRPCRouter({
  // List all integrations for current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const repositories = getIntegrationsRepositories(ctx);

    await repositories.oauthStates.deleteExpired({
      profileId: ctx.session.user.id,
      now: new Date(),
    });

    return parseBoundaryValue(
      z.array(integrationRowSchema),
      await repositories.integrations.listByProfileId(ctx.session.user.id),
      "Integrations repository returned invalid rows",
    );
  }),

  getSyncOverview: protectedProcedure.query(async ({ ctx }) => {
    const repositories = getIntegrationsRepositories(ctx);
    const providerSyncRepository = createProviderSyncRepository({ db: getRequiredDb(ctx) });
    const integrations = parseBoundaryValue(
      z.array(integrationRowSchema),
      await repositories.integrations.listByProfileId(ctx.session.user.id),
      "Integrations repository returned invalid rows",
    );
    const integrationIds = integrations.map((integration) => integration.id);
    const [syncStates, activeJobs] = await Promise.all([
      readProviderSyncOverviewState(providerSyncRepository, integrationIds),
      readActiveProviderSyncJobs(providerSyncRepository, ctx.session.user.id),
    ]);
    const integrationsByProvider = new Map(
      integrations.map((integration) => [integration.provider, integration]),
    );

    const overview = providerCapabilityRegistry.map((definition) => {
      const integration = integrationsByProvider.get(definition.id);
      const activityState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === activityHistoryResource,
          )
        : null;
      const setupState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === profileEnrichmentResource,
          )
        : null;
      const plannedState = integration
        ? syncStates.find(
            (candidate) =>
              candidate.integrationId === integration.id &&
              candidate.resource === plannedWorkoutsResource,
          )
        : null;
      const activeActivityJob = integration
        ? activeJobs.find(
            (job) =>
              job.integrationId === integration.id && job.jobType === wahooActivityHistoryJobType,
          )
        : null;
      const activePlannedJob = integration
        ? activeJobs.find(
            (job) =>
              job.integrationId === integration.id && wahooPlannedWorkoutJobTypes.has(job.jobType),
          )
        : null;
      const activityHistorySupported = supportsActivityHistorySync(definition.id);
      const setupSupported = providerHasCapability(definition.id, "profile_enrichment_read");
      const plannedSupported = providerHasCapability(definition.id, "planned_activity_push");
      const activityHistoryStatus = !activityHistorySupported
        ? "unsupported"
        : activeActivityJob?.status === "running"
          ? "importing"
          : activeActivityJob?.status === "queued"
            ? "queued"
            : activityState?.lastError
              ? "failed"
              : activityState?.lastSyncSucceededAt
                ? "synced"
                : "idle";
      const setupStatus = !setupSupported
        ? "unsupported"
        : getSyncMetadataStatus(setupState?.metadata) === "running"
          ? "refreshing"
          : setupState?.lastError
            ? "failed"
            : setupState?.lastSyncSucceededAt
              ? "refreshed"
              : "idle";
      const plannedStatus = !plannedSupported
        ? "unsupported"
        : activePlannedJob?.status === "running"
          ? "syncing"
          : activePlannedJob?.status === "queued"
            ? "queued"
            : plannedState?.lastError
              ? "failed"
              : "automatic";
      const providerHealthLastError =
        activityState?.lastError ?? setupState?.lastError ?? plannedState?.lastError ?? null;
      const providerHealthStatus = !integration
        ? "unsupported"
        : looksLikeReconnectError(providerHealthLastError)
          ? "needs_reconnect"
          : "connected";

      return {
        actions: integration ? getConfigurableProviderActions(definition.id) : [],
        activityHistory: {
          lastError: activityState?.lastError ?? null,
          lastFailedAt: activityState?.lastSyncFailedAt ?? null,
          lastSucceededAt: activityState?.lastSyncSucceededAt ?? null,
          queuedJobId: activeActivityJob?.id ?? null,
          status: activityHistoryStatus,
        },
        plannedWorkouts: {
          lastError: plannedState?.lastError ?? null,
          lastFailedAt: plannedState?.lastSyncFailedAt ?? null,
          lastSucceededAt: plannedState?.lastSyncSucceededAt ?? null,
          queuedJobId: activePlannedJob?.id ?? null,
          status: plannedStatus,
        },
        providerHealth: {
          lastError: providerHealthLastError,
          status: providerHealthStatus,
        },
        setupData: {
          lastError: setupState?.lastError ?? null,
          lastFailedAt: setupState?.lastSyncFailedAt ?? null,
          lastSucceededAt: setupState?.lastSyncSucceededAt ?? null,
          status: setupStatus,
        },
        connected: Boolean(integration),
        integrationId: integration?.id ?? null,
        label: getProviderCapabilityDefinition(definition.id).label,
        provider: definition.id,
      };
    });

    return parseBoundaryValue(syncOverviewSchema, overview, "Sync overview was invalid");
  }),

  syncNow: protectedProcedure.input(syncNowInputSchema).mutation(async ({ ctx, input }) => {
    const repositories = getIntegrationsRepositories(ctx);
    const integration = await repositories.integrations.findByProfileIdAndProvider({
      profileId: ctx.session.user.id,
      provider: input.provider,
    });

    if (!integration) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Integration not found",
      });
    }

    const providerSyncRepository = createProviderSyncRepository({ db: getRequiredDb(ctx) });
    const service = new OnboardingProviderEnrichmentService({ db: getRequiredDb(ctx) });
    const setupRefresh = await refreshProviderSetupForSyncNow({
      profileId: ctx.session.user.id,
      provider: input.provider,
      service,
    });
    const historySync = await enqueueActivityHistoryReconcile({
      integrationId: integration.id,
      profileId: ctx.session.user.id,
      provider: input.provider,
      providerSyncRepository,
      trigger: "manual",
    });

    return parseBoundaryValue(
      syncNowResultSchema,
      { ...historySync, setupRefresh },
      "Sync now result was invalid",
    );
  }),

  // Get OAuth authorization URL
  getAuthUrl: protectedProcedure.input(getAuthUrlInputSchema).mutation(async ({ ctx, input }) => {
    const repositories = getIntegrationsRepositories(ctx);
    const now = new Date();

    await repositories.oauthStates.deleteExpired({
      profileId: ctx.session.user.id,
      now,
    });

    // Generate secure state token
    const state = crypto.randomUUID();

    // Get environment-specific callback URL
    const callbackUrl = getCallbackUrl(input.provider);

    // Store state with user ID and mobile redirect URI
    await repositories.oauthStates.create({
      state,
      profileId: ctx.session.user.id,
      provider: input.provider,
      mobileRedirectUri: input.redirectUri || getDefaultMobileRedirect(),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });

    // Build OAuth URL based on provider
    const authUrl = buildOAuthUrl(input.provider, state, callbackUrl);

    return parseBoundaryValue(
      authUrlResultSchema,
      { url: authUrl, state },
      "OAuth URL was invalid",
    );
  }),

  // Disconnect integration
  disconnect: protectedProcedure.input(disconnectInputSchema).mutation(async ({ ctx, input }) => {
    const repositories = getIntegrationsRepositories(ctx);

    await repositories.integrations.deleteByProfileIdAndProvider({
      profileId: ctx.session.user.id,
      provider: input.provider,
    });

    return { success: true };
  }),

  // Validate OAuth state and retrieve stored data
  validateOAuthState: publicProcedure
    .input(validateOAuthStateInputSchema)
    .query(async ({ ctx, input }) => {
      const repositories = getIntegrationsRepositories(ctx);
      const now = new Date();

      await repositories.oauthStates.deleteExpired({ now });

      const data = await repositories.oauthStates.findValidByState({
        state: input.state,
        now,
      });

      if (!data) {
        return null;
      }

      return parseBoundaryValue(
        validatedOAuthStateResultSchema,
        {
          userId: data.profile_id,
          provider: parseBoundaryValue(
            oauthStateRepositoryRowSchema,
            data,
            "OAuth state repository returned invalid data",
          ).provider,
          mobileRedirectUri: data.mobile_redirect_uri,
          createdAt: data.created_at.toISOString(),
        },
        "OAuth state normalization returned invalid data",
      );
    }),

  // Store integration after successful OAuth (used by callback)
  storeIntegration: publicProcedure
    .input(storeIntegrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const repositories = getIntegrationsRepositories(ctx);
      const now = new Date();

      await repositories.oauthStates.deleteExpired({ now });

      const oauthState = await repositories.oauthStates.findValidByState({
        state: input.state,
        now,
      });

      if (!oauthState) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired OAuth state",
        });
      }

      const validatedOAuthState = parseBoundaryValue(
        oauthStateRepositoryRowSchema,
        oauthState,
        "OAuth state repository returned invalid data",
      );

      if (
        validatedOAuthState.profile_id !== input.userId ||
        validatedOAuthState.provider !== input.provider
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OAuth state does not match integration request",
        });
      }

      const integration = await repositories.integrations.upsertByProfileIdAndProvider({
        profileId: input.userId,
        provider: input.provider,
        externalId: input.externalId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        scope: input.scope,
      });

      if (input.provider === "wahoo" && supportsActivityHistorySync(input.provider)) {
        await enqueueActivityHistoryReconcile({
          integrationId: integration.id,
          profileId: input.userId,
          provider: input.provider,
          providerSyncRepository: createProviderSyncRepository({ db: getRequiredDb(ctx) }),
          trigger: "connect",
        });
      }

      // Clean up the OAuth state after successful storage
      await repositories.oauthStates.deleteByState(input.state);

      return strictSuccessSchema.parse({ success: true });
    }),

  // Delete OAuth state (used by callback on error)
  deleteOAuthState: publicProcedure
    .input(deleteOAuthStateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const repositories = getIntegrationsRepositories(ctx);

      await repositories.oauthStates.deleteByState(input.state);

      return strictSuccessSchema.parse({ success: true });
    }),
});

// Helper functions (will be implemented in separate files)
function getCallbackUrl(provider: PublicIntegrationProvider): string {
  const baseUrl =
    process.env.OAUTH_CALLBACK_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  return `${baseUrl}/api/integrations/callback/${provider}`;
}

function getDefaultMobileRedirect(): string {
  return process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI || "gradientpeak://integrations";
}

function buildOAuthUrl(
  provider: PublicIntegrationProvider,
  state: string,
  callbackUrl: string,
): string {
  const configs = {
    strava: {
      authUrl: "https://www.strava.com/oauth/authorize",
      clientId: process.env.STRAVA_CLIENT_ID!,
      scopes: ["activity:read_all"],
    },
    wahoo: {
      authUrl: "https://api.wahooligan.com/oauth/authorize",
      clientId: process.env.WAHOO_CLIENT_ID!,
      scopes: [
        "email",
        "user_write",
        "power_zones_read",
        "power_zones_write",
        "workouts_read",
        "workouts_write",
        "plans_read",
        "plans_write",
        "routes_read",
        "routes_write",
        "user_read",
        "offline_data",
      ],
    },
    trainingpeaks: {
      authUrl: "https://oauth.trainingpeaks.com/oauth/authorize",
      clientId: process.env.TRAININGPEAKS_CLIENT_ID!,
      scopes: ["activities:read", "metrics:read"],
    },
    garmin: {
      authUrl: "https://connect.garmin.com/oauthConfirm",
      clientId: process.env.GARMIN_CLIENT_ID!,
      scopes: ["activity_read"],
    },
    zwift: {
      authUrl: "https://secure.zwift.com/oauth/authorize",
      clientId: process.env.ZWIFT_CLIENT_ID!,
      scopes: ["activity:read"],
    },
  };

  const config = configs[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  return `${config.authUrl}?${params.toString()}`;
}
