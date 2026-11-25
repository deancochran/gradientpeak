import {
  activityPlanStructureSchema,
  formatDateOnlyInTimeZone,
  garminProviderManifest,
  ianaTimezoneSchema,
  providerActionIsAuthorized,
  providerCapabilityIsAuthorized,
} from "@repo/core";
import { type DrizzleDbClient, schema } from "@repo/db";
import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { admitGarminPlannedSessionSyncWindow } from "../../infrastructure/repositories/drizzle-garmin-training-sync-repository";
import {
  classifyGarminOAuthFailure,
  deregisterGarminUser,
  exchangeGarminOAuthCode,
  GarminOAuthError,
  resolveGarminOAuthIdentity,
} from "../../lib/integrations/garmin/oauth";
import { projectGarminTrainingActivityPlan } from "../../lib/integrations/garmin/training-mapper";
import {
  isGarminIntegrationEnabled,
  requireProviderOAuthConfig,
} from "../../lib/integrations/oauth-config";
import {
  createOAuthCodeChallenge,
  deriveOAuthCodeVerifier,
} from "../../lib/integrations/oauth-pkce";
import {
  createOAuthStateBinding,
  getOAuthCallbackUrl,
} from "../../lib/integrations/oauth-state-binding";
import { createGarminCredentialRepository } from "../../repositories/garmin-credential-repository";
import { createGarminLifecycleRepository } from "../../repositories/garmin-lifecycle-repository";
import { resolveGarminCredentials } from "./garmin-credentials";
import type {
  OAuthServerProviderRuntime,
  ProviderIntegrationRuntimeContext,
  ProviderOverviewEvidence,
} from "./provider-runtime";

const emptyOverview: ProviderOverviewEvidence = {
  activityHistory: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "unsupported",
    importRun: null,
  },
  plannedActivities: {
    lastError: null,
    lastFailedAt: null,
    lastSucceededAt: null,
    queuedJobId: null,
    status: "unsupported",
  },
  setupData: { lastError: null, lastFailedAt: null, lastSucceededAt: null, status: "unsupported" },
};

const GARMIN_TRAINING_JOB_TYPE = "garmin.training_planned_session";

function addCivilDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function recoveryPhase(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const training = (payload as { garminTraining?: unknown }).garminTraining;
  if (!training || typeof training !== "object") return null;
  const phase = (training as { recoveryPhase?: unknown }).recoveryPhase;
  return typeof phase === "string" ? phase : null;
}

async function hasUnsupportedProjection(input: {
  db: DrizzleDbClient;
  profileId: string;
}): Promise<boolean> {
  const [profile] = await input.db
    .select({ planningTimezone: schema.profiles.planning_timezone })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, input.profileId))
    .limit(1);
  const timezone = ianaTimezoneSchema.safeParse(profile?.planningTimezone);
  if (!timezone.success) return false;
  const today = formatDateOnlyInTimeZone(new Date(), timezone.data);
  const sessions = await input.db
    .select({
      description: schema.activityPlans.description,
      name: schema.activityPlans.name,
      structure: schema.activityPlans.structure,
    })
    .from(schema.plannedSessions)
    .innerJoin(
      schema.activityPlans,
      eq(schema.activityPlans.id, schema.plannedSessions.activity_plan_id),
    )
    .where(
      and(
        eq(schema.plannedSessions.profile_id, input.profileId),
        eq(schema.plannedSessions.status, "scheduled"),
        gte(schema.plannedSessions.planning_date, today),
        lte(schema.plannedSessions.planning_date, addCivilDays(today, 14)),
      ),
    )
    .orderBy(asc(schema.plannedSessions.planning_date), asc(schema.plannedSessions.id))
    .limit(50);
  return sessions.some((session) => {
    const structure = activityPlanStructureSchema.safeParse(session.structure);
    if (!structure.success) return true;
    try {
      projectGarminTrainingActivityPlan({
        description: session.description,
        name: session.name,
        structure: structure.data,
      });
      return false;
    } catch {
      return true;
    }
  });
}

async function readOverview(
  input:
    | ProviderIntegrationRuntimeContext
    | { db: DrizzleDbClient; profileId: string; integration: null; scope: null },
): Promise<ProviderOverviewEvidence> {
  if (!input.integration) return emptyOverview;
  const deliveryGranted = providerCapabilityIsAuthorized({
    provider: "garmin",
    capability: "planned_activity_push",
    grantedScope: input.scope,
  });
  const [jobs, unsupportedProjection] = await Promise.all([
    input.db
      .select({
        id: schema.providerSyncJobs.id,
        integrationGeneration: schema.providerSyncJobs.integration_generation,
        payload: schema.providerSyncJobs.payload,
        status: schema.providerSyncJobs.status,
        updatedAt: schema.providerSyncJobs.updated_at,
      })
      .from(schema.providerSyncJobs)
      .where(
        and(
          eq(schema.providerSyncJobs.integration_id, input.integration.id),
          eq(schema.providerSyncJobs.provider, "garmin"),
          eq(schema.providerSyncJobs.job_type, GARMIN_TRAINING_JOB_TYPE),
          or(
            // Current-generation queue state describes delivery progress. An
            // old running lease must never make a reconnected account look as
            // though it is currently syncing.
            and(
              eq(schema.providerSyncJobs.integration_generation, input.integration.generation),
              inArray(schema.providerSyncJobs.status, [
                "queued",
                "running",
                "completed",
                "failed",
                "dead_lettered",
              ]),
            ),
            // A pre-effect receipt is exceptional durable evidence: retain it
            // across generations as a visible recovery block, not a retry.
            sql`coalesce(${schema.providerSyncJobs.payload} #>> '{garminTraining,recoveryPhase}', '') <> ''`,
          ),
        ),
      )
      .orderBy(asc(schema.providerSyncJobs.queue_sequence)),
    hasUnsupportedProjection({ db: input.db, profileId: input.profileId }),
  ]);
  const currentJobs = jobs.filter(
    (job) => job.integrationGeneration === input.integration.generation,
  );
  const active = currentJobs.find((job) => job.status === "running" || job.status === "queued");
  const recovery = jobs.find(
    (job) =>
      recoveryPhase(job.payload) !== null ||
      (job.integrationGeneration === input.integration.generation &&
        job.status === "dead_lettered"),
  );
  const completed = [...currentJobs].reverse().find((job) => job.status === "completed");
  const status = !deliveryGranted
    ? "unsupported"
    : recovery
      ? "recovery_required"
      : active?.status === "running"
        ? "syncing"
        : active
          ? "queued"
          : unsupportedProjection
            ? "unsupported_projection"
            : "automatic";
  return {
    activityHistory: emptyOverview.activityHistory,
    plannedActivities: {
      lastError:
        status === "unsupported"
          ? "Reconnect this account to grant Garmin activity-plan import permission"
          : status === "recovery_required"
            ? "A Garmin activity-plan sync needs recovery before it can continue"
            : status === "unsupported_projection"
              ? "Some upcoming activity plans cannot be sent to Garmin"
              : null,
      lastFailedAt: recovery?.updatedAt?.toISOString() ?? null,
      lastSucceededAt: completed?.updatedAt?.toISOString() ?? null,
      queuedJobId: active?.id ?? null,
      status,
    },
    setupData: emptyOverview.setupData,
  };
}

export const garminProviderRuntime: OAuthServerProviderRuntime<typeof garminProviderManifest> = {
  provider: "garmin",
  manifest: garminProviderManifest,
  connection: {
    kind: "oauth2",
    provider: "garmin",
    isOAuthConfigured: isGarminIntegrationEnabled,
    createOAuthAuthorization: ({ state }) => {
      const config = requireProviderOAuthConfig("garmin");
      const params = new URLSearchParams({
        client_id: config.clientId,
        code_challenge: createOAuthCodeChallenge(
          // The verifier is deterministic and state-bound; it is not sent to the browser.
          deriveOAuthCodeVerifier({ clientSecret: config.clientSecret, provider: "garmin", state }),
        ),
        code_challenge_method: "S256",
        redirect_uri: getOAuthCallbackUrl("garmin"),
        response_type: "code",
        state,
      });
      return {
        binding: createOAuthStateBinding({ config, provider: "garmin", state }),
        url: `${config.authUrl}?${params}`,
      };
    },
    validateOAuthStateBinding: ({ binding, state }) => {
      const expected = createOAuthStateBinding({
        config: requireProviderOAuthConfig("garmin"),
        provider: "garmin",
        state,
      });
      return (
        binding.callbackUri === expected.callbackUri &&
        binding.requestedScope === expected.requestedScope &&
        binding.verifierHash === expected.verifierHash
      );
    },
    exchangeOAuthCode: ({ code, state }) => exchangeGarminOAuthCode(code, state),
    resolveOAuthIdentity: async (tokens) => {
      const identity = await resolveGarminOAuthIdentity({ accessToken: tokens.access_token });
      return {
        externalId: identity.externalId,
        requiresActivation: identity.requiresActivation,
        scope: identity.permissions.join(" "),
      };
    },
    activateOAuthCredential: async () => undefined,
    classifyOAuthFailure: classifyGarminOAuthFailure,
  },
  execution: {
    kind: "server",
    server: {
      availability: { isConfigured: isGarminIntegrationEnabled },
      actionAuthorization: {
        allowsAction: ({ action, grantedScope }) =>
          providerActionIsAuthorized({ provider: "garmin", action, grantedScope }),
      },
      overview: { readOverviewEvidence: readOverview },
      connectedProfile: {
        // This is a narrow, server-side reconciliation only. It does not alter
        // the manifest's unavailable product capability claim.
        enqueueConnectedProfileWork: async ({ db, profileId, transaction }) => {
          await admitGarminPlannedSessionSyncWindow({ db, profileId, transaction });
        },
      },
      disconnection: {
        availableWhenDisabled: true,
        disconnect: async ({ db, profileId }) => {
          const lifecycle = createGarminLifecycleRepository(db);
          await resolveGarminCredentials({
            profileId,
            repository: createGarminCredentialRepository(db),
          });
          const attempt = await lifecycle.beginDisconnect(profileId);
          if (attempt.disposition !== "ready") return;
          // A durable pending generation blocks callback/reconnect while remote outcome is unknown.
          try {
            await deregisterGarminUser(attempt.accessToken);
            if (!(await lifecycle.finalizeDisconnect(attempt))) {
              throw new Error("Garmin disconnect lifecycle changed before finalization");
            }
          } catch (error) {
            await lifecycle.failDisconnect(
              attempt,
              error instanceof GarminOAuthError && error.reason === "http_401",
            );
            throw new Error(
              "Garmin removal is not confirmed. Retry disconnect; if it remains pending, check connected apps in Garmin Connect.",
            );
          }
        },
      },
    },
  },
};
