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
  createIcalFeedRepository,
  createIntegrationsRepositories,
  createProviderSyncRepository,
  createWahooRepository,
} from "../infrastructure/repositories";
import { IcalSyncError, IcalSyncService } from "../lib/integrations/ical/sync-service";
import { createWahooRouteStorage, WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { logger } from "../lib/logger";
import { WahooSyncJobService } from "../lib/provider-sync/wahoo-job-service";
import { ROUTES_BUCKET } from "../lib/routes/route-file-helpers";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const storageService = getApiStorageService();

const providerSchema = publicIntegrationProviderSchema;

const timestampStringSchema = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value.toISOString() : value));

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

const cleanupExpiredStatesInputSchema = z
  .object({
    userId: z.string().uuid().optional(),
  })
  .strict()
  .optional();

const cleanupExpiredStatesResultSchema = z
  .object({
    success: z.literal(true),
    cleaned: z.number().int().nonnegative(),
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

const refreshSetupDataResultSchema = z
  .object({
    fieldsFilled: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
    fieldsKept: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
    fieldsUpdated: z.array(z.enum(["dob", "gender", "weight_kg", "ftp"])),
    keptExistingValues: z.boolean(),
    provider: providerSchema,
    status: z.enum(["succeeded", "partial", "failed"]),
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

const icalSyncResultSchema = z
  .object({
    feed_id: z.string().uuid(),
    feed_url: z.string().url(),
    imported: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    synced_at: z.string().datetime(),
    cache_tags: z.array(z.string()),
  })
  .strict();

const icalFeedListItemSchema = z
  .object({
    feed_id: z.string().uuid(),
    feed_url: z.string().url(),
    event_count: z.number().int().nonnegative(),
    last_event_updated_at: timestampStringSchema.nullable(),
  })
  .strict();

const icalRemoveFeedResultSchema = z
  .object({
    success: z.literal(true),
    removed_events: z.number().int().nonnegative(),
    cache_tags: z.array(z.string()),
  })
  .strict();

const wahooSyncActionSchema = z.enum(["created", "updated", "recreated", "no_change"]);

const wahooSyncResultSchema = z
  .object({
    success: z.boolean(),
    action: wahooSyncActionSchema,
    workoutId: z.string().min(1).optional(),
    warnings: z.array(z.string()).optional(),
    error: z.string().min(1).optional(),
  })
  .strict();

const wahooEventSyncStatusSchema = z.union([
  z
    .object({
      synced: z.boolean(),
      provider: providerSchema.optional(),
      externalId: z.string().min(1).nullable().optional(),
      id: z.string().min(1).optional(),
      updatedAt: timestampStringSchema.nullable().optional(),
      syncedAt: timestampStringSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      externalId: z.string().min(1),
      id: z.string().min(1),
      updatedAt: timestampStringSchema.nullable(),
    })
    .strict(),
  z.null(),
]);

const wahooTestSyncResultSchema = z
  .object({
    success: z.boolean(),
    action: wahooSyncActionSchema,
    workoutId: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    warnings: z.array(z.string()).optional(),
    timestamp: z.string().datetime(),
  })
  .strict();

const refreshTokenProviderResponseSchema = z
  .object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1).optional().nullable(),
    expires_in: z
      .union([
        z.number().int().nonnegative(),
        z
          .string()
          .regex(/^\d+$/)
          .transform((value) => Number(value)),
      ])
      .optional()
      .nullable(),
  })
  .passthrough();

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

function normalizeWahooSyncResult(result: unknown, message: string) {
  return parseBoundaryValue(wahooSyncResultSchema, result, message);
}

function normalizeWahooEventSyncStatus(status: unknown) {
  const parsed = parseBoundaryValue(
    wahooEventSyncStatusSchema,
    status,
    "Wahoo sync status returned invalid data",
  );

  if (parsed === null) {
    return {
      synced: false,
      provider: "wahoo" as const,
      externalId: null,
      id: undefined,
      updatedAt: null,
      syncedAt: null,
    };
  }

  if ("synced" in parsed) {
    return {
      synced: parsed.synced,
      provider: parsed.provider ?? "wahoo",
      externalId: parsed.externalId ?? null,
      id: parsed.id,
      updatedAt: parsed.updatedAt ?? null,
      syncedAt: parsed.syncedAt ?? null,
    };
  }

  return {
    synced: true,
    provider: "wahoo" as const,
    externalId: parsed.externalId,
    id: parsed.id,
    updatedAt: parsed.updatedAt,
    syncedAt: null,
  };
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

function getIcalSyncService(ctx: Context) {
  return new IcalSyncService(
    createIcalFeedRepository({
      db: getRequiredDb(ctx),
    }),
  );
}

function getWahooSyncService(ctx: Context) {
  return new WahooSyncService({
    repository: createWahooRepository({ db: getRequiredDb(ctx) }),
    storage: createWahooRouteStorage({
      async downloadRouteGpx(filePath) {
        const { data, error } = await storageService.storage.from(ROUTES_BUCKET).download(filePath);
        if (error || !data) return null;
        return data.text();
      },
    }),
  });
}

function getWahooSyncJobService(ctx: Context) {
  return new WahooSyncJobService({
    providerSyncRepository: createProviderSyncRepository({ db: getRequiredDb(ctx) }),
    syncService: getWahooSyncService(ctx),
    wahooRepository: createWahooRepository({ db: getRequiredDb(ctx) }),
  });
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

const wahooQueuedJobResultSchema = z
  .object({
    jobId: z.string().uuid(),
    queued: z.boolean(),
  })
  .strict();

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

const refreshTokenInputSchema = z
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

  refreshSetupData: protectedProcedure
    .input(syncNowInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = new OnboardingProviderEnrichmentService({ db: getRequiredDb(ctx) });

      try {
        return parseBoundaryValue(
          refreshSetupDataResultSchema,
          await service.refreshSetupData(ctx.session.user.id, input.provider),
          "Refresh setup data result was invalid",
        );
      } catch (error) {
        if (error instanceof TRPCError) throw error;

        if (error instanceof Error && error.message === "Integration not found") {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to refresh setup data",
          cause: error,
        });
      }
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

  // Refresh access token
  refreshToken: protectedProcedure
    .input(refreshTokenInputSchema)
    .mutation(async ({ ctx, input }) => {
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

      const credentials = await repositories.integrations.findCredentialsByProfileIdAndProvider({
        profileId: ctx.session.user.id,
        provider: input.provider,
      });

      if (!credentials?.refresh_token) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No refresh token available",
        });
      }

      let newTokens: Awaited<ReturnType<typeof refreshProviderToken>>;
      try {
        newTokens = await refreshProviderToken(input.provider, credentials.refresh_token);
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to refresh integration token",
          cause: error,
        });
      }

      const updateData = {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newTokens.expires_at,
      };

      await repositories.integrations.updateTokensByProfileIdAndProvider({
        profileId: ctx.session.user.id,
        provider: input.provider,
        accessToken: updateData.access_token,
        refreshToken: updateData.refresh_token ?? null,
        expiresAt: updateData.expires_at ? new Date(updateData.expires_at) : null,
      });

      return strictSuccessSchema.parse({ success: true });
    }),

  // Cleanup expired OAuth states for the signed-in user
  cleanupExpiredStates: protectedProcedure
    .input(cleanupExpiredStatesInputSchema)
    .mutation(async ({ ctx }) => {
      const repositories = getIntegrationsRepositories(ctx);
      const expiredCount = await repositories.oauthStates.deleteExpired({
        profileId: ctx.session.user.id,
        now: new Date(),
      });
      const oldCount = await repositories.oauthStates.deleteCreatedBefore({
        profileId: ctx.session.user.id,
        before: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      return parseBoundaryValue(
        cleanupExpiredStatesResultSchema,
        {
          success: true,
          cleaned: expiredCount + oldCount,
        },
        "OAuth state cleanup returned invalid data",
      );
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

  // ==============================
  // iCal Feed Endpoints
  // ==============================

  ical: createTRPCRouter({
    addFeed: protectedProcedure
      .input(
        z
          .object({
            url: z.string().url(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);
        const feedId = crypto.randomUUID();

        try {
          return parseBoundaryValue(
            icalSyncResultSchema,
            await syncService.syncFeed({
              profileId: ctx.session.user.id,
              feedId,
              feedUrl: input.url,
            }),
            "iCal sync service returned invalid feed data",
          );
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }

          if (error instanceof IcalSyncError) {
            throw new TRPCError({
              code: error.code,
              message: error.message,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to add iCal feed",
          });
        }
      }),

    listFeeds: protectedProcedure.input(z.object({}).strict()).query(async ({ ctx }) => {
      const syncService = getIcalSyncService(ctx);

      try {
        return parseBoundaryValue(
          z.array(icalFeedListItemSchema),
          await syncService.listFeeds(ctx.session.user.id),
          "iCal sync service returned invalid feed list data",
        );
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        if (error instanceof IcalSyncError) {
          throw new TRPCError({
            code: error.code,
            message: error.message,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to list iCal feeds",
        });
      }
    }),

    updateFeed: protectedProcedure
      .input(
        z
          .object({
            feed_id: z.string().uuid(),
            url: z.string().url(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);

        try {
          return parseBoundaryValue(
            icalSyncResultSchema,
            await syncService.syncFeed({
              profileId: ctx.session.user.id,
              feedId: input.feed_id,
              feedUrl: input.url,
            }),
            "iCal sync service returned invalid updated feed data",
          );
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }

          if (error instanceof IcalSyncError) {
            throw new TRPCError({
              code: error.code,
              message: error.message,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to update iCal feed",
          });
        }
      }),

    removeFeed: protectedProcedure
      .input(
        z
          .object({
            feed_id: z.string().uuid(),
            purge_events: z.boolean().optional().default(true),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);

        try {
          return parseBoundaryValue(
            icalRemoveFeedResultSchema,
            await syncService.removeFeed({
              profileId: ctx.session.user.id,
              feedId: input.feed_id,
              purgeEvents: input.purge_events,
            }),
            "iCal sync service returned invalid remove-feed data",
          );
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }

          if (error instanceof IcalSyncError) {
            throw new TRPCError({
              code: error.code,
              message: error.message,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to remove iCal feed",
          });
        }
      }),
  }),

  // ==============================
  // Wahoo Sync Endpoints
  // ==============================

  // Sync a planned activity event to Wahoo
  wahoo: createTRPCRouter({
    syncEvent: protectedProcedure
      .input(
        z
          .object({
            eventId: z.string().uuid(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const jobService = getWahooSyncJobService(ctx);
        const result = parseBoundaryValue(
          wahooQueuedJobResultSchema,
          await jobService.enqueuePublishEvent({
            eventId: input.eventId,
            profileId: ctx.session.user.id,
          }),
          "Wahoo sync job service returned invalid enqueue data",
        );

        return result;
      }),

    // Unsync (remove) an event from Wahoo
    unsyncEvent: protectedProcedure
      .input(
        z
          .object({
            eventId: z.string().uuid(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const jobService = getWahooSyncJobService(ctx);
        const result = parseBoundaryValue(
          wahooQueuedJobResultSchema,
          await jobService.enqueueUnsyncEvent({
            eventId: input.eventId,
            profileId: ctx.session.user.id,
          }),
          "Wahoo sync job service returned invalid unsync enqueue data",
        );

        return result;
      }),

    // Get sync status for an event
    getEventSyncStatus: protectedProcedure
      .input(
        z
          .object({
            eventId: z.string().uuid(),
          })
          .strict(),
      )
      .query(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);
        const status = normalizeWahooEventSyncStatus(
          await syncService.getEventSyncStatus(input.eventId, ctx.session.user.id),
        );

        return status;
      }),

    // Test sync with detailed diagnostics
    testSync: protectedProcedure
      .input(
        z
          .object({
            eventId: z.string().uuid(),
          })
          .strict(),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);

        logger.debug("[Wahoo Test Sync] Starting test sync", { eventId: input.eventId });

        const result = normalizeWahooSyncResult(
          await syncService.syncEvent(input.eventId, ctx.session.user.id),
          "Wahoo sync service returned invalid test-sync data",
        );

        logger.debug("[Wahoo Test Sync] Sync result", result);

        // Return detailed result including warnings
        return parseBoundaryValue(
          wahooTestSyncResultSchema,
          {
            success: result.success,
            action: result.action,
            workoutId: result.workoutId,
            error: result.error,
            warnings: result.warnings,
            timestamp: new Date().toISOString(),
          },
          "Wahoo test sync normalization returned invalid data",
        );
      }),
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

async function refreshProviderToken(
  provider: PublicIntegrationProvider,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}> {
  const configs = {
    strava: {
      tokenUrl: "https://www.strava.com/api/v3/oauth/token",
      clientId: process.env.STRAVA_CLIENT_ID!,
      clientSecret: process.env.STRAVA_CLIENT_SECRET!,
    },
    wahoo: {
      tokenUrl: "https://api.wahooligan.com/oauth/token",
      clientId: process.env.WAHOO_CLIENT_ID!,
      clientSecret: process.env.WAHOO_CLIENT_SECRET!,
    },
    trainingpeaks: {
      tokenUrl: "https://oauth.trainingpeaks.com/oauth/token",
      clientId: process.env.TRAININGPEAKS_CLIENT_ID!,
      clientSecret: process.env.TRAININGPEAKS_CLIENT_SECRET!,
    },
    garmin: {
      tokenUrl: "https://connectapi.garmin.com/oauth-service/oauth/access_token",
      clientId: process.env.GARMIN_CLIENT_ID!,
      clientSecret: process.env.GARMIN_CLIENT_SECRET!,
    },
    zwift: {
      tokenUrl: "https://secure.zwift.com/oauth/token",
      clientId: process.env.ZWIFT_CLIENT_ID!,
      clientSecret: process.env.ZWIFT_CLIENT_SECRET!,
    },
  };

  const config = configs[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token for ${provider}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number | string | null;
  };

  const parsed = parseBoundaryValue(
    refreshTokenProviderResponseSchema,
    data,
    `Token refresh response for ${provider} was invalid`,
  );

  return {
    access_token: parsed.access_token,
    refresh_token: parsed.refresh_token || refreshToken,
    expires_at: parsed.expires_in
      ? new Date(Date.now() + parsed.expires_in * 1000).toISOString()
      : undefined,
  };
}
