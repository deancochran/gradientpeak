import { isProviderRuntimeEnabled } from "@repo/core";
import { publicIntegrationProviderSchema, publicIntegrationsRowSchema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getProviderSyncOverview, syncIntegrationNow } from "../application/integrations";
import { OnboardingProviderEnrichmentService } from "../application/onboarding-provider-enrichment";
import type { Context } from "../context";
import { getRequiredDb } from "../db";
import { createIntegrationsRepositories } from "../infrastructure/repositories";
import {
  isLocalProviderOAuthTestAdapterEnabled,
  isProviderOAuthConfigured,
  requireProviderOAuthConfig,
} from "../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
  issueLocalOAuthAuthorizationCode,
} from "../lib/integrations/oauth-pkce";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const providerSchema = publicIntegrationProviderSchema;
const integrationRowSchema = publicIntegrationsRowSchema;
const strictSuccessSchema = z.object({ success: z.literal(true) }).strict();

const authUrlResultSchema = z.object({ url: z.string().url(), state: z.string().uuid() }).strict();
const syncNowInputSchema = z.object({ provider: providerSchema }).strict();
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
      configured: z.boolean(),
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
      primaryAction: z.enum(["connect", "disconnect", "reconnect"]).nullable(),
      provider: providerSchema,
      summary: z
        .object({
          badge: z.string().min(1),
          health: z.enum([
            "connected",
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
  .object({ provider: providerSchema, redirectUri: z.string().url().optional() })
  .strict();
const disconnectInputSchema = z.object({ provider: providerSchema }).strict();

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

  getSyncOverview: protectedProcedure.query(async ({ ctx }) =>
    parseBoundaryValue(
      syncOverviewSchema,
      await getProviderSyncOverview({ db: getRequiredDb(ctx), profileId: ctx.session.user.id }),
      "Sync overview was invalid",
    ),
  ),

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
          message: "Failed to refresh setup data",
          cause: error,
        });
      }
    }),

  getAuthUrl: protectedProcedure.input(getAuthUrlInputSchema).mutation(async ({ ctx, input }) => {
    const repositories = getIntegrationsRepositories(ctx);
    const now = new Date();
    if (!isProviderRuntimeEnabled(input.provider) || !isProviderOAuthConfigured(input.provider)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Integration is not configured on this server",
      });
    }
    await repositories.oauthStates.deleteExpired({ profileId: ctx.session.user.id, now });
    const state = crypto.randomUUID();
    const returnUri = requireAllowedOAuthReturn(input.redirectUri);
    const callbackUrl = getCallbackUrl(input.provider);
    await repositories.oauthStates.create({
      state,
      profileId: ctx.session.user.id,
      provider: input.provider,
      mobileRedirectUri: returnUri,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
    return parseBoundaryValue(
      authUrlResultSchema,
      { url: buildOAuthUrl(input.provider, state, callbackUrl, returnUri), state },
      "OAuth URL was invalid",
    );
  }),

  disconnect: protectedProcedure.input(disconnectInputSchema).mutation(async ({ ctx, input }) => {
    await getIntegrationsRepositories(ctx).integrations.deleteByProfileIdAndProvider({
      profileId: ctx.session.user.id,
      provider: input.provider,
    });
    return strictSuccessSchema.parse({ success: true });
  }),
});

function getApplicationBaseUrl(): string {
  return (
    process.env.OAUTH_CALLBACK_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

function getCallbackUrl(provider: z.infer<typeof providerSchema>): string {
  return `${getApplicationBaseUrl()}/api/integrations/callback/${provider}`;
}

function getDefaultMobileRedirect(): string {
  return process.env.NEXT_PUBLIC_MOBILE_REDIRECT_URI || "gradientpeak://integrations";
}

function requireAllowedOAuthReturn(redirectUri?: string): string {
  const target = redirectUri ?? getDefaultMobileRedirect();
  const parsedTarget = new URL(target);
  const isConfiguredWebReturn =
    parsedTarget.origin === new URL(getApplicationBaseUrl()).origin &&
    parsedTarget.pathname === "/integrations" &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  const isLocalAdapterWebReturn =
    isLocalProviderOAuthTestAdapterEnabled() &&
    ["127.0.0.1", "localhost"].includes(parsedTarget.hostname) &&
    parsedTarget.pathname === "/integrations" &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  if (target !== getDefaultMobileRedirect() && !isConfiguredWebReturn && !isLocalAdapterWebReturn) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth redirect URI is not allowed" });
  }
  return target;
}

function buildOAuthUrl(
  provider: z.infer<typeof providerSchema>,
  state: string,
  callbackUrl: string,
  returnUri: string,
): string {
  const config = requireProviderOAuthConfig(provider);
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
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${config.authUrl}?${params.toString()}`;
}
