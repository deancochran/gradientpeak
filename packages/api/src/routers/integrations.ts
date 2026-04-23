import {
  type PublicIntegrationProvider,
  publicIntegrationProviderSchema,
  publicIntegrationsRowSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
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

    // Debug logging
    console.log("OAuth URL generated:", {
      provider: input.provider,
      state: state,
      callbackUrl: callbackUrl,
      authUrl: authUrl,
    });

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

      if (!integration.refresh_token) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No refresh token available",
        });
      }

      let newTokens;
      try {
        newTokens = await refreshProviderToken(input.provider, integration.refresh_token);
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

  // Cleanup expired OAuth states (optionally for specific user)
  cleanupExpiredStates: publicProcedure
    .input(cleanupExpiredStatesInputSchema)
    .mutation(async ({ ctx, input }) => {
      const repositories = getIntegrationsRepositories(ctx);
      const expiredCount = await repositories.oauthStates.deleteExpired({
        profileId: input?.userId,
        now: new Date(),
      });
      const oldCount = await repositories.oauthStates.deleteCreatedBefore({
        profileId: input?.userId,
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

      await repositories.integrations.upsertByProfileIdAndProvider({
        profileId: input.userId,
        provider: input.provider,
        externalId: input.externalId,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        scope: input.scope,
      });

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

        console.log(`[Wahoo Test Sync] Starting test sync for event: ${input.eventId}`);

        const result = normalizeWahooSyncResult(
          await syncService.syncEvent(input.eventId, ctx.session.user.id),
          "Wahoo sync service returned invalid test-sync data",
        );

        console.log("[Wahoo Test Sync] Sync result:", result);

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
