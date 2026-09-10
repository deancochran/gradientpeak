import {
  executableIntegrationProviderIdSchema,
  providerOnboardingPresentationSchema,
} from "@repo/core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertIntegrationManagementOpen,
  cancelPendingOAuthWithFence,
  createPendingOAuthStateWithFence,
  getProviderSetupRuntime,
  getProviderSyncOverview,
  IntegrationDisconnectPendingError,
  IntegrationOnboardingClosedError,
  ProviderRuntimeUnavailableError,
  requireProviderDisconnectionRuntime,
  requireProviderOAuthAuthorizationRuntime,
  requireProviderSetupRuntime,
  requireProviderSynchronizationRuntime,
} from "../application/integrations";
import { getRequiredDb } from "../db";
import { isLocalWahooOAuthTestAdapterEnabled } from "../lib/integrations/oauth-config";
import { getDefaultMobileOAuthRedirect } from "../lib/integrations/oauth-redirect";
import { createTRPCRouter, protectedProcedure } from "../trpc";

const strictSuccessSchema = z.object({ success: z.literal(true) }).strict();

const authUrlResultSchema = z.object({ url: z.string().url(), state: z.string().uuid() }).strict();
const providerActionInputSchema = z
  .object({ provider: executableIntegrationProviderIdSchema })
  .strict();
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
    plannedActivitySync: z
      .object({
        affectedCount: z.number().int().nonnegative(),
        error: z.string().optional(),
        failedCount: z.number().int().nonnegative().optional(),
        jobId: z.string().uuid().nullable().optional(),
        operation: z.enum(["publish", "unsync"]),
        queued: z.boolean(),
        skippedCount: z.number().int().nonnegative().optional(),
        success: z.boolean(),
      })
      .nullable()
      .optional(),
  })
  .strict();
const refreshSetupDataResultSchema = z
  .object({
    fieldsFilled: z.array(z.enum(["dob", "gender", "weight_kg"])),
    fieldsKept: z.array(z.enum(["dob", "gender", "weight_kg"])),
    fieldsUpdated: z.array(z.enum(["dob", "gender", "weight_kg"])),
    keptExistingValues: z.boolean(),
    provider: executableIntegrationProviderIdSchema,
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
      onboarding: providerOnboardingPresentationSchema,
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
              onboarding_status: z.enum([
                "provider_selection",
                "processing",
                "review",
                "completed",
              ]),
            })
            .strict(),
        })
        .strict(),
      connected: z.boolean(),
      integrationId: z.string().uuid().nullable(),
      label: z.string().min(1),
      unresolvedReviewCount: z.number().int().nonnegative(),
      primaryAction: z.enum(["connect", "disconnect", "reconnect"]).nullable(),
      provider: executableIntegrationProviderIdSchema,
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
  .object({
    provider: executableIntegrationProviderIdSchema,
    redirectUri: z.string().url().optional(),
  })
  .strict();
const cancelPendingOAuthOutputSchema = z
  .object({ cancelled: z.number().int().nonnegative() })
  .strict();

function parseBoundaryValue<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message, cause: parsed.error });
  }
  return parsed.data;
}

function throwIntegrationGateError(error: unknown): never {
  if (
    error instanceof IntegrationOnboardingClosedError ||
    error instanceof IntegrationDisconnectPendingError
  ) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof ProviderRuntimeUnavailableError) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Integration not found" });
  }
  throw error;
}

export function attachProviderSetupEvidence<
  TItem extends { provider: string; setupData: Record<string, unknown> },
>(input: {
  overview: TItem[];
  setupEvidence: ReadonlyMap<
    string,
    { profile: unknown; sources: Record<string, { label: string }>; values: unknown } | null
  >;
}) {
  return input.overview.map((item) => {
    const evidence = input.setupEvidence.get(item.provider);
    return {
      ...item,
      setupData: evidence
        ? {
            ...item.setupData,
            values: evidence.values,
            profile: evidence.profile,
            sources: Object.fromEntries(
              Object.entries(evidence.sources).map(([field, source]) => [
                field,
                { label: source.label },
              ]),
            ),
          }
        : {
            ...item.setupData,
            values: {},
            profile: { dob: null, gender: null, onboarding_status: "provider_selection" },
            sources: {},
          },
    };
  });
}

export const integrationsRouter = createTRPCRouter({
  getSyncOverview: protectedProcedure.query(async ({ ctx }) => {
    const db = getRequiredDb(ctx);
    const profileId = ctx.session.user.id;
    const overview = await getProviderSyncOverview({ db, profileId });
    const setupEvidence = new Map(
      await Promise.all(
        overview.map(async (item) => {
          const setup = getProviderSetupRuntime(item.provider);
          return [
            item.provider,
            setup && item.onboarding.evidence.profileDetails
              ? await setup.readSetupEvidence({ db, profileId })
              : null,
          ] as const;
        }),
      ),
    );
    return parseBoundaryValue(
      syncOverviewSchema,
      attachProviderSetupEvidence({ overview, setupEvidence }),
      "Sync overview was invalid",
    );
  }),

  syncNow: protectedProcedure.input(providerActionInputSchema).mutation(async ({ ctx, input }) =>
    requireProviderSynchronizationRuntime(input.provider)
      .syncNow({ db: getRequiredDb(ctx), profileId: ctx.session.user.id })
      .then((result) =>
        parseBoundaryValue(syncNowResultSchema, result, "Sync now result was invalid"),
      )
      .catch(throwIntegrationGateError),
  ),

  refreshSetupData: protectedProcedure
    .input(providerActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await assertIntegrationManagementOpen(getRequiredDb(ctx), ctx.session.user.id);
        return parseBoundaryValue(
          refreshSetupDataResultSchema,
          await requireProviderSetupRuntime(input.provider).refreshSetupEvidence({
            db: getRequiredDb(ctx),
            profileId: ctx.session.user.id,
          }),
          "Refresh setup data result was invalid",
        );
      } catch (error) {
        if (error instanceof IntegrationOnboardingClosedError) throwIntegrationGateError(error);
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
    const now = new Date();
    let runtime: ReturnType<typeof requireProviderOAuthAuthorizationRuntime>;
    try {
      runtime = requireProviderOAuthAuthorizationRuntime(input.provider);
    } catch (error) {
      if (error instanceof ProviderRuntimeUnavailableError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Integration is not configured on this server",
        });
      }
      throw error;
    }
    const state = crypto.randomUUID();
    const returnUri = requireAllowedOAuthReturn(input.redirectUri);
    const authorization = runtime.createOAuthAuthorization({ returnUri, state });
    try {
      await createPendingOAuthStateWithFence({
        db: getRequiredDb(ctx),
        ...authorization.binding,
        state,
        profileId: ctx.session.user.id,
        provider: input.provider,
        mobileRedirectUri: returnUri,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      });
    } catch (error) {
      throwIntegrationGateError(error);
    }
    return parseBoundaryValue(
      authUrlResultSchema,
      { url: authorization.url, state },
      "OAuth URL was invalid",
    );
  }),

  cancelPendingOAuth: protectedProcedure
    .input(providerActionInputSchema)
    .output(cancelPendingOAuthOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelPendingOAuthWithFence({
          db: getRequiredDb(ctx),
          profileId: ctx.session.user.id,
          provider: input.provider,
        });
      } catch (error) {
        throwIntegrationGateError(error);
      }
    }),

  disconnect: protectedProcedure
    .input(providerActionInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        await assertIntegrationManagementOpen(getRequiredDb(ctx), ctx.session.user.id);
      } catch (error) {
        throwIntegrationGateError(error);
      }
      await requireProviderDisconnectionRuntime(input.provider).disconnect({
        db: getRequiredDb(ctx),
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
    (parsedTarget.pathname === "/integrations" || parsedTarget.pathname === "/onboarding") &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  const isLocalAdapterWebReturn =
    isLocalWahooOAuthTestAdapterEnabled() &&
    ["127.0.0.1", "localhost"].includes(parsedTarget.hostname) &&
    (parsedTarget.pathname === "/integrations" || parsedTarget.pathname === "/onboarding") &&
    parsedTarget.search === "" &&
    parsedTarget.hash === "";
  if (target !== defaultMobileRedirect && !isConfiguredWebReturn && !isLocalAdapterWebReturn) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "OAuth redirect URI is not allowed" });
  }
  return target;
}
