import type {
  PublicIntegrationProvider,
  PublicIntegrationsInsert,
  PublicIntegrationsRow,
  PublicIntegrationsUpdate,
} from "@repo/core";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { WahooSyncService } from "../lib/integrations/wahoo/sync-service";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

// Input schemas using supazod types
const providerSchema = z.enum([
  "strava",
  "wahoo",
  "trainingpeaks",
  "garmin",
  "zwift",
]);

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
    // Clean up expired states for this user when fetching integrations
    await ctx.supabase
      .from("oauth_states")
      .delete()
      .eq("profile_id", ctx.session.user.id)
      .lt("expires_at", new Date().toISOString());

    const { data, error } = await ctx.supabase
      .from("integrations")
      .select("*")
      .eq("profile_id", ctx.session.user.id);

    if (error) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: error.message,
      });
    }

    return data as PublicIntegrationsRow[];
  }),

  // Get OAuth authorization URL
  getAuthUrl: protectedProcedure
    .input(getAuthUrlInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Clean up any expired states for this user before creating a new one
      await ctx.supabase
        .from("oauth_states")
        .delete()
        .eq("profile_id", ctx.session.user.id)
        .lt("expires_at", new Date().toISOString());

      // Generate secure state token
      const state = crypto.randomUUID();

      // Get environment-specific callback URL
      const callbackUrl = getCallbackUrl(input.provider);

      // Store state with user ID and mobile redirect URI
      await storeOAuthState(state, {
        userId: ctx.session.user.id,
        provider: input.provider,
        mobileRedirectUri: input.redirectUri || getDefaultMobileRedirect(),
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
  disconnect: protectedProcedure
    .input(disconnectInputSchema)
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase
        .from("integrations")
        .delete()
        .eq("profile_id", ctx.session.user.id)
        .eq("provider", input.provider);

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true };
    }),

  // Refresh access token
  refreshToken: protectedProcedure
    .input(refreshTokenInputSchema)
    .mutation(async ({ ctx, input }) => {
      // Get existing integration
      const { data: integration, error: fetchError } = await ctx.supabase
        .from("integrations")
        .select("*")
        .eq("profile_id", ctx.session.user.id)
        .eq("provider", input.provider)
        .single();

      if (fetchError || !integration) {
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
      const newTokens = await refreshProviderToken(
        input.provider,
        integration.refresh_token,
      );

      const updateData: PublicIntegrationsUpdate = {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: newTokens.expires_at,
      };

      const { error: updateError } = await ctx.supabase
        .from("integrations")
        .update(updateData)
        .eq("profile_id", ctx.session.user.id)
        .eq("provider", input.provider);

      if (updateError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: updateError.message,
        });
      }

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
      // Build query for expired states
      let query = ctx.supabase.from("oauth_states").delete();

      // If userId provided, only cleanup for that user
      if (input?.userId) {
        query = query.eq("profile_id", input.userId);
      }

      // Delete expired OAuth states
      const { error: deleteError, count } = await query.lt(
        "expires_at",
        new Date().toISOString(),
      );

      if (deleteError) {
        console.error("Failed to cleanup expired OAuth states:", deleteError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cleanup expired states",
        });
      }

      // Also cleanup very old states (failsafe for states without proper expiry)
      let oldQuery = ctx.supabase.from("oauth_states").delete();

      // If userId provided, only cleanup for that user
      if (input?.userId) {
        oldQuery = oldQuery.eq("profile_id", input.userId);
      }

      const { error: oldDeleteError, count: oldCount } = await oldQuery.lt(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ); // 24 hours

      if (oldDeleteError) {
        console.error("Failed to cleanup old OAuth states:", oldDeleteError);
      }

      return {
        success: true,
        cleaned: (count || 0) + (oldCount || 0),
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
      // Clean up expired states while we're here
      await ctx.supabase
        .from("oauth_states")
        .delete()
        .lt("expires_at", new Date().toISOString());

      // Retrieve the OAuth state
      const { data, error } = await ctx.supabase
        .from("oauth_states")
        .select("*")
        .eq("state", input.state)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (error || !data) {
        return null;
      }

      return {
        userId: data.profile_id,
        provider: data.provider as PublicIntegrationProvider,
        mobileRedirectUri: data.mobile_redirect_uri,
        createdAt: data.created_at,
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
      const integrationData: PublicIntegrationsInsert = {
        profile_id: input.userId,
        provider: input.provider,
        external_id: input.externalId,
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
        expires_at: input.expiresAt,
        scope: input.scope,
      };

      // Store the integration
      const { error: insertError } = await ctx.supabase
        .from("integrations")
        .upsert(integrationData, {
          onConflict: "profile_id,provider",
        });

      if (insertError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to store integration",
        });
      }

      // Clean up the OAuth state after successful storage
      await ctx.supabase.from("oauth_states").delete().eq("state", input.state);

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
      await ctx.supabase.from("oauth_states").delete().eq("state", input.state);

      return { success: true };
    }),

  // ==============================
  // Wahoo Sync Endpoints
  // ==============================

  // Sync a planned activity to Wahoo
  wahoo: createTRPCRouter({
    syncPlannedActivity: protectedProcedure
      .input(
        z.object({
          plannedActivityId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = new WahooSyncService(ctx.supabase);
        const result = await syncService.syncPlannedActivity(
          input.plannedActivityId,
          ctx.session.user.id,
        );

        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Failed to sync to Wahoo",
          });
        }

        return result;
      }),

    // Unsync (remove) a planned activity from Wahoo
    unsyncPlannedActivity: protectedProcedure
      .input(
        z.object({
          plannedActivityId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = new WahooSyncService(ctx.supabase);
        const result = await syncService.unsyncPlannedActivity(
          input.plannedActivityId,
          ctx.session.user.id,
        );

        if (!result.success) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Failed to unsync from Wahoo",
          });
        }

        return result;
      }),

    // Get sync status for a planned activity
    getSyncStatus: protectedProcedure
      .input(
        z.object({
          plannedActivityId: z.string().uuid(),
        }),
      )
      .query(async ({ ctx, input }) => {
        const syncService = new WahooSyncService(ctx.supabase);
        const status = await syncService.getSyncStatus(
          input.plannedActivityId,
          ctx.session.user.id,
        );

        return status;
      }),

    // Test sync with detailed diagnostics
    testSync: protectedProcedure
      .input(
        z.object({
          plannedActivityId: z.string().uuid(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const syncService = new WahooSyncService(ctx.supabase);

        console.log(
          `[Wahoo Test Sync] Starting test sync for planned activity: ${input.plannedActivityId}`,
        );

        const result = await syncService.syncPlannedActivity(
          input.plannedActivityId,
          ctx.session.user.id,
        );

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
  return (
    process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI || "gradientpeak://integrations"
  );
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
        "power_zones_read",
        "workouts_read",
        "workouts_write",
        "plans_read",
        "plans_write",
        "routes_read",
        "routes_write",
        "user_read",
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

async function storeOAuthState(
  state: string,
  data: {
    userId: string;
    provider: PublicIntegrationProvider;
    mobileRedirectUri: string;
  },
): Promise<void> {
  // Create a Supabase client with service role key for server operations
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PRIVATE_SUPABASE_SECRET_KEY!,
  );

  const { error } = await supabase.from("oauth_states").insert({
    state,
    profile_id: data.userId,
    provider: data.provider,
    mobile_redirect_uri: data.mobileRedirectUri,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
  });

  if (error) {
    console.error("Failed to store OAuth state:", error);
    throw new Error("Failed to store OAuth state");
  }
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
      tokenUrl:
        "https://connectapi.garmin.com/oauth-service/oauth/access_token",
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

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
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
