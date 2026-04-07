import {
  type IntegrationRow,
  type PublicIntegrationProvider,
  type PublicIntegrationsRow,
  publicIntegrationProviderSchema,
} from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import {
  createIcalFeedRepository,
  createIntegrationsRepositories,
  createWahooRepository,
} from "../infrastructure/repositories";
import { IcalSyncError, IcalSyncService } from "../lib/integrations/ical/sync-service";
import { createWahooRouteStorage, WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { getApiStorageService } from "../storage-service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

const storageService = getApiStorageService();

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
        const { data, error } = await storageService.storage.from("routes").download(filePath);
        if (error || !data) return null;
        return data.text();
      },
    }),
  });
}

// Input schemas using supazod types
const providerSchema = publicIntegrationProviderSchema;

const getAuthUrlInputSchema = z.object({
  provider: providerSchema,
  redirectUri: z.string().url().optional(), // Mobile app provides its redirect URI
});

const disconnectInputSchema = z.object({
  provider: providerSchema,
});

const refreshTokenInputSchema = z.object({
  provider: providerSchema,
});

export const integrationsRouter = createTRPCRouter({
  // List all integrations for current user
  list: protectedProcedure.query(async ({ ctx }) => {
    const repositories = getIntegrationsRepositories(ctx);

    await repositories.oauthStates.deleteExpired({
      profileId: ctx.session.user.id,
      now: new Date(),
    });

    return repositories.integrations.listByProfileId(ctx.session.user.id);
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

    return {
      url: authUrl,
      state,
    };
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

      // Refresh token with provider
      const newTokens = await refreshProviderToken(input.provider, integration.refresh_token);

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

      return { success: true };
    }),

  // Cleanup expired OAuth states (optionally for specific user)
  cleanupExpiredStates: publicProcedure
    .input(
      z
        .object({
          userId: z.string().optional(),
        })
        .optional(),
    )
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

      return {
        success: true,
        cleaned: expiredCount + oldCount,
      };
    }),

  // Validate OAuth state and retrieve stored data
  validateOAuthState: publicProcedure
    .input(
      z.object({
        state: z.string(),
      }),
    )
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

      return {
        userId: data.profile_id,
        provider: data.provider as PublicIntegrationProvider,
        mobileRedirectUri: data.mobile_redirect_uri,
        createdAt: data.created_at.toISOString(),
      };
    }),

  // Store integration after successful OAuth (used by callback)
  storeIntegration: publicProcedure
    .input(
      z.object({
        userId: z.string(),
        provider: providerSchema,
        externalId: z.string(),
        accessToken: z.string(),
        refreshToken: z.string().nullable(),
        expiresAt: z.string().nullable(),
        scope: z.string().nullable(),
        state: z.string(), // To clean up after storing
      }),
    )
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

      return { success: true };
    }),

  // Delete OAuth state (used by callback on error)
  deleteOAuthState: publicProcedure
    .input(
      z.object({
        state: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const repositories = getIntegrationsRepositories(ctx);

      await repositories.oauthStates.deleteByState(input.state);

      return { success: true };
    }),

  // ==============================
  // iCal Feed Endpoints
  // ==============================

  ical: createTRPCRouter({
    addFeed: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);
        const feedId = crypto.randomUUID();

        try {
          return await syncService.syncFeed({
            profileId: ctx.session.user.id,
            feedId,
            feedUrl: input.url,
          });
        } catch (error) {
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

    listFeeds: protectedProcedure.input(z.object({})).query(async ({ ctx }) => {
      const syncService = getIcalSyncService(ctx);

      try {
        return await syncService.listFeeds(ctx.session.user.id);
      } catch (error) {
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
        z.object({
          feed_id: z.string().uuid(),
          url: z.string().url(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);

        try {
          return await syncService.syncFeed({
            profileId: ctx.session.user.id,
            feedId: input.feed_id,
            feedUrl: input.url,
          });
        } catch (error) {
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
        z.object({
          feed_id: z.string().uuid(),
          purge_events: z.boolean().optional().default(true),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getIcalSyncService(ctx);

        try {
          return await syncService.removeFeed({
            profileId: ctx.session.user.id,
            feedId: input.feed_id,
            purgeEvents: input.purge_events,
          });
        } catch (error) {
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
        z.object({
          eventId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);
        const result = await syncService.syncEvent(input.eventId, ctx.session.user.id);

        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Failed to sync to Wahoo",
          });
        }

        return result;
      }),

    // Unsync (remove) an event from Wahoo
    unsyncEvent: protectedProcedure
      .input(
        z.object({
          eventId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);
        const result = await syncService.unsyncEvent(input.eventId, ctx.session.user.id);

        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Failed to unsync from Wahoo",
          });
        }

        return result;
      }),

    // Get sync status for an event
    getEventSyncStatus: protectedProcedure
      .input(
        z.object({
          eventId: z.string().uuid(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);
        const status = await syncService.getEventSyncStatus(input.eventId, ctx.session.user.id);

        return status;
      }),

    // Test sync with detailed diagnostics
    testSync: protectedProcedure
      .input(
        z.object({
          eventId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = getWahooSyncService(ctx);

        console.log(`[Wahoo Test Sync] Starting test sync for event: ${input.eventId}`);

        const result = await syncService.syncEvent(input.eventId, ctx.session.user.id);

        console.log("[Wahoo Test Sync] Sync result:", result);

        // Return detailed result including warnings
        return {
          success: result.success,
          action: result.action,
          workoutId: result.workoutId,
          error: result.error,
          warnings: result.warnings,
          timestamp: new Date().toISOString(),
        };
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
    expires_in?: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : undefined,
  };
}
