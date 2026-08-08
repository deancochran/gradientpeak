import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getProviderSyncOverview, syncIntegrationNow } from "../application/integrations";
import { WahooProfileSetupService } from "../application/wahoo-profile-setup-service";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import {
  createIntegrationsRepositories,
  createWahooSyncRepository,
} from "../infrastructure/repositories";
import {
  isLocalWahooOAuthTestAdapterEnabled,
  isWahooIntegrationEnabled,
  isWahooOAuthConfigured,
  requireWahooOAuthConfig,
} from "../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../lib/integrations/oauth-pkce";
import { getDefaultMobileOAuthRedirect } from "../lib/integrations/oauth-redirect";
import {
  createOAuthStateBinding,
  getOAuthCallbackUrl,
} from "../lib/integrations/oauth-state-binding";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const wahooProviderSchema = z.literal("wahoo");
const strictSuccessSchema = z.object({ success: z.literal(true) }).strict();

const authUrlResultSchema = z.object({ url: z.string().url(), state: z.string().uuid() }).strict();
const syncNowInputSchema = z.object({ provider: wahooProviderSchema }).strict();
const syncNowResultSchema = z
  .object({
    jobId: z.string().uuid(),
    queued: z.boolean(),
    setupRefresh: z
      .object({
        fieldsFilled: z.array(z.enum(["dob", "gender", "weight_kg"])),
        fieldsKept: z.array(z.enum(["dob", "gender", "weight_kg"])),
        fieldsUpdated: z.array(z.enum(["dob", "gender", "weight_kg"])),
        keptExistingValues: z.boolean(),
        status: z.enum(["queued", "succeeded", "partial", "failed"]),
      })
      .nullable(),
  })
  .strict();
const refreshSetupDataResultSchema = z
  .object({
    fieldsFilled: z.array(z.enum(["dob", "gender", "weight_kg"])),
    fieldsKept: z.array(z.enum(["dob", "gender", "weight_kg"])),
    fieldsUpdated: z.array(z.enum(["dob", "gender", "weight_kg"])),
    keptExistingValues: z.boolean(),
    provider: wahooProviderSchema,
    status: z.enum(["queued", "succeeded", "partial", "failed"]),
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
          importRun: z
            .object({
              id: z.string().uuid(),
              status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
              importedCount: z.number().int().nonnegative(),
              skippedCount: z.number().int().nonnegative(),
              failedCount: z.number().int().nonnegative(),
            })
            .strict()
            .nullable(),
        })
        .strict(),
      plannedActivities: z
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
          status: z.enum([
            "connected",
            "disconnecting",
            "disconnected",
            "needs_reconnect",
            "unsupported",
          ]),
        })
        .strict(),
      configured: z.boolean(),
      setupData: z
        .object({
          lastError: z.string().nullable(),
          lastFailedAt: z.string().nullable(),
          lastSucceededAt: z.string().nullable(),
          status: z.enum(["idle", "refreshing", "refreshed", "failed", "unsupported"]),
          values: z
            .object({
              dob: z.string().optional(),
              gender: z.enum(["male", "female", "other"]).optional(),
              weight_kg: z.number().optional(),
            })
            .strict(),
          sources: z
            .object({
              dob: z.object({ label: z.string() }).strict().optional(),
              gender: z.object({ label: z.string() }).strict().optional(),
              weight_kg: z.object({ label: z.string() }).strict().optional(),
            })
            .strict(),
          profile: z
            .object({
              dob: z.string().nullable(),
              gender: z.enum(["male", "female", "other"]).nullable(),
              onboarded: z.boolean().nullable(),
            })
            .strict(),
        })
        .strict(),
      connected: z.boolean(),
      integrationId: z.string().uuid().nullable(),
      label: z.string().min(1),
      primaryAction: z.enum(["connect", "disconnect", "reconnect"]).nullable(),
      provider: wahooProviderSchema,
      summary: z
        .object({
          badge: z.string().min(1),
          health: z.enum([
            "connected",
            "disconnecting",
            "syncing",
            "queued",
            "needs_reconnect",
            "failed",
            "unavailable",
          ]),
          subtitle: z.string().min(1),
          title: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
);
const getAuthUrlInputSchema = z
  .object({ provider: wahooProviderSchema, redirectUri: z.string().url().optional() })
  .strict();
const disconnectInputSchema = z.object({ provider: wahooProviderSchema }).strict();

function parseBoundaryValue<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: parsed.error });
  }
  return parsed.data;
}

function getIntegrationsRepositories(ctx: Context) {
  return createIntegrationsRepositories(getRequiredDb(ctx));
}

export const integrationsRouter = createTRPCRouter({
  getSyncOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);
    const profileId = ctx.session.user.id;
    const [overview, imported] = await Promise.all([
      getProviderSyncOverview({ db, profileId }),
      new WahooProfileSetupService({ db }).getImportedOnboardingValues(profileId),
    ]);
    return parseBoundaryValue(
      syncOverviewSchema,
      overview.map((provider) => ({
        ...provider,
        setupData: {
          ...provider.setupData,
          values: imported.values,
          profile: imported.profile,
          sources: Object.fromEntries(
            Object.entries(imported.sources).map(([field, source]) => [
              field,
              { label: source.label },
            ]),
          ),
        },
      })),
      "Sync overview was invalid",
    );
  }),

  syncNow: protectedProcedure.input(syncNowInputSchema).mutation(async ({ ctx, input }) =>
    parseBoundaryValue(
      syncNowResultSchema,
      await syncIntegrationNow({
        db: getRequiredDb(ctx),
        profileId: ctx.session.user.id,
        provider: input.provider,
      }),
      "Sync now result was invalid",
    ),
  ),

  refreshSetupData: protectedProcedure
    .input(syncNowInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!isWahooIntegrationEnabled()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
      }
      const service = new WahooProfileSetupService({ db: getRequiredDb(ctx) });
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
          message: "Failed to refresh setup data",
          cause: error,
        });
      }
    }),

  getAuthUrl: protectedProcedure.input(getAuthUrlInputSchema).mutation(async ({ ctx, input }) => {
    const repositories = getIntegrationsRepositories(ctx);
    const now = new Date();
    if (!isWahooOAuthConfigured()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Integration is not configured on this server",
      });
    }
    const existingIntegration = (
      await repositories.integrations.listByProfileId(ctx.session.user.id)
    ).find((integration) => integration.provider === input.provider);
    if (existingIntegration?.lifecycle_status === "disconnect_pending") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Integration disconnect is still in progress",
      });
    }
    await repositories.oauthStates.deleteExpired({ profileId: ctx.session.user.id, now });
    const state = crypto.randomUUID();
    const returnUri = requireAllowedOAuthReturn(input.redirectUri);
    const config = requireWahooOAuthConfig();
    const callbackUrl = getOAuthCallbackUrl(input.provider);
    const binding = createOAuthStateBinding({ config, provider: input.provider, state });
    await repositories.oauthStates.create({
      ...binding,
      state,
      profileId: ctx.session.user.id,
      provider: input.provider,
      mobileRedirectUri: returnUri,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
    return parseBoundaryValue(
      authUrlResultSchema,
      { url: buildOAuthUrl(input.provider, state, callbackUrl, returnUri, config), state },
      "OAuth URL was invalid",
    );
  }),

  disconnect: protectedProcedure.input(disconnectInputSchema).mutation(async ({ ctx }) => {
    await createWahooSyncRepository({ db: getRequiredDb(ctx) }).requestWahooDisconnect({
      profileId: ctx.session.user.id,
    });
    return strictSuccessSchema.parse({ success: true });
  }),
});

function getApplicationBaseUrl(): string {
  return process.env.OAUTH_CALLBACK_BASE_URL || process.env.APP_URL || "http://localhost:3000";
}

function requireAllowedOAuthReturn(redirectUri?: string): string {
  const defaultMobileRedirect = getDefaultMobileOAuthRedirect();
  const target = redirectUri ?? defaultMobileRedirect;
  const parsedTarget = new URL(target);
  const isConfiguredWebReturn =
    parsedTarget.origin === new URL(getApplicationBaseUrl()).origin &&
    parsedTarget.pathname === "/integrations" &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  const isLocalAdapterWebReturn =
    isLocalWahooOAuthTestAdapterEnabled() &&
    ["127.0.0.1", "localhost"].includes(parsedTarget.hostname) &&
    parsedTarget.pathname === "/integrations" &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  if (target !== defaultMobileRedirect && !isConfiguredWebReturn && !isLocalAdapterWebReturn) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth redirect URI is not allowed" });
  }
  return target;
}

function buildOAuthUrl(
  provider: "wahoo",
  state: string,
  callbackUrl: string,
  returnUri: string,
  config = requireWahooOAuthConfig(),
): string {
  const verifier = deriveOAuthCodeVerifier({ clientSecret: config.clientSecret, provider, state });
  const challenge = createOAuthCodeChallenge(verifier);
  if (config.adapter === "local-test") {
    const callback = new URL(callbackUrl);
    callback.searchParams.set(
      "code",
      issueLocalOAuthAuthorizationCode({ challenge, config, provider }),
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
