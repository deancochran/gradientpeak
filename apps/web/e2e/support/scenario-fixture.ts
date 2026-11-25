import { randomUUID } from "node:crypto";
import {
  type ActivitySubmission,
  activityArtifactId,
  markDisposableAthleteStateDirty,
  processAthleteStateJobs,
  readyActivityIngestion,
  submitActivity,
} from "@repo/api/test-support/activity-evidence-acceptance";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import {
  activityPlans,
  activityTrainingEffects,
  chatbotOperationReceipts,
  plannedSessions,
  profileAthleteState,
  profileGoals,
  profiles,
} from "@repo/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type { AuthenticatedE2EActor } from "../support/actors";
import type { LocalE2EDatabase } from "../support/database";
import type { DomainFixtureBuilders } from "../support/domain";
import type { E2EExecutionIdentity } from "../support/identity";

type ScenarioSnapshot = Awaited<ReturnType<typeof readScenarioRows>>;

function receiptResultReferencesSession(result: unknown, sessionId: string) {
  if (!result || typeof result !== "object") return false;
  const session = (result as Record<string, unknown>).session;
  if (!session || typeof session !== "object") return false;
  return (session as Record<string, unknown>).id === sessionId;
}

export type SessionScenarioFixture = {
  activityPlanId: string;
  activityPlanRevision: number;
  date: string;
  horizonDate: string;
  sessionId: string;
  sessionCount: number;
  sessionRevision: number;
  operationReceiptCount: (operationId: string) => Promise<number>;
  operationReceiptsForSession: (
    sessionId: string,
  ) => Promise<Array<{ command: string; operationId: string }>>;
  stateRevision: number;
  substituteId: string;
  substituteName: string;
  snapshot: () => Promise<ScenarioSnapshot>;
};

async function readScenarioRows(database: LocalE2EDatabase, profileId: string) {
  return Promise.all([
    database.db
      .select()
      .from(plannedSessions)
      .where(eq(plannedSessions.profile_id, profileId))
      .orderBy(asc(plannedSessions.id)),
    database.db
      .select()
      .from(activityPlans)
      .where(eq(activityPlans.profile_id, profileId))
      .orderBy(asc(activityPlans.id)),
    database.db
      .select()
      .from(profileGoals)
      .where(eq(profileGoals.profile_id, profileId))
      .orderBy(asc(profileGoals.id)),
    database.db
      .select()
      .from(profileAthleteState)
      .where(eq(profileAthleteState.profile_id, profileId)),
    database.db
      .select()
      .from(activityTrainingEffects)
      .where(eq(activityTrainingEffects.profile_id, profileId)),
  ]);
}

async function submitCanonicalBikeFixture(
  database: LocalE2EDatabase,
  input: { durationMs: number; finishedAt: Date; powerWatts: number; profileId: string },
) {
  const activityId = randomUUID();
  const segmentId = randomUUID();
  const digest = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
  const artifact = {
    sha256: digest,
    byteSize: 1_024,
    bucket: "activity-files",
    path: `artifacts/sha256/${input.profileId}/${digest}`,
    mediaType: "application/vnd.ant.fit" as const,
    format: "fit" as const,
  };
  const startedAt = new Date(input.finishedAt.getTime() - input.durationMs);
  const sourceArtifactId = activityArtifactId(input.profileId, artifact.sha256, artifact.byteSize);
  const ingestion = await readyActivityIngestion(database.db, {
    profileId: input.profileId,
    operationId: `scenario-preview:${activityId}`,
    source: "manual_import",
    artifact,
  });
  const normalizedPowerResult = calculateCyclingNormalizedPower({
    samples: Array.from({ length: input.durationMs / 5_000 + 1 }, (_, index) => ({
      timestampSeconds: Math.min(index * 5, input.durationMs / 1_000),
      powerWatts: input.powerWatts,
    })),
  });
  if (normalizedPowerResult.status === "unavailable")
    throw new Error("Expected numeric cycling power.");
  const submission: ActivitySubmission = {
    requestedActivityId: activityId,
    profileId: input.profileId,
    name: "Canonical cycling scenario fixture",
    notes: null,
    contentVisibility: "private",
    startedAt,
    finishedAt: input.finishedAt,
    elapsedMs: input.durationMs,
    activeMs: input.durationMs,
    movingMs: input.durationMs,
    timingCoverage: "complete",
    distanceMeters: 20_000,
    calories: null,
    elevationGainMeters: null,
    avgHeartRate: null,
    maxHeartRate: null,
    avgPower: Math.round(input.powerWatts),
    maxPower: Math.round(input.powerWatts),
    avgCadence: null,
    maxCadence: null,
    avgSpeedMps: null,
    maxSpeedMps: null,
    normalizedSpeedMps: null,
    avgTemperature: null,
    deviceManufacturer: null,
    deviceProduct: null,
    laps: null,
    mapBounds: null,
    polyline: null,
    segmentSet: {
      version: 1,
      elapsedMs: input.durationMs,
      segments: [
        {
          id: segmentId,
          ordinal: 0,
          role: "activity",
          activity_category: "bike",
          startOffsetMs: 0,
          endOffsetMs: input.durationMs,
          source: {
            kind: "artifact",
            artifactId: sourceArtifactId,
            source: { standard: "fit", format: "fit" },
          },
          summary: {
            version: 1,
            timing: {
              timingCoverage: "complete",
              activeMs: input.durationMs,
              movingMs: input.durationMs,
            },
            distanceMeters: 20_000,
            averagePowerWatts: input.powerWatts,
            normalizedPowerResult,
          },
        },
      ],
    },
    analysis: {
      efforts: [],
      detectedLTHR: null,
      ingestion: { source: "manual_import", ...ingestion, artifact },
    },
  };
  await submitActivity(database.db, submission);
}

/** Real ingestion plus the state worker creates the published baseline; no baseline row is fabricated. */
export async function createSessionScenarioFixture(input: {
  actor: AuthenticatedE2EActor;
  database: LocalE2EDatabase;
  e2eData: DomainFixtureBuilders;
  identity: E2EExecutionIdentity;
}): Promise<SessionScenarioFixture> {
  const now = new Date();
  const date = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const horizonDate = new Date(now.getTime() + 8 * 86_400_000).toISOString().slice(0, 10);
  await input.database.db
    .update(profiles)
    .set({ planning_timezone: "UTC" })
    .where(eq(profiles.id, input.actor.profileId));
  await submitCanonicalBikeFixture(input.database, {
    profileId: input.actor.profileId,
    finishedAt: new Date(now.getTime() - 14 * 86_400_000),
    durationMs: 1_800_000,
    powerWatts: 300,
  });
  await submitCanonicalBikeFixture(input.database, {
    profileId: input.actor.profileId,
    finishedAt: new Date(now.getTime() - 2 * 86_400_000),
    durationMs: 1_440_000,
    powerWatts: 280,
  });
  await markDisposableAthleteStateDirty({
    db: input.database.db,
    effectiveAt: new Date(now.getTime() - 14 * 86_400_000),
    now,
    profileId: input.actor.profileId,
  });
  await processAthleteStateJobs({ db: input.database.db, limit: 2, now });
  await processAthleteStateJobs({ db: input.database.db, limit: 2, now });
  const [state] = await input.database.db
    .select()
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, input.actor.profileId));
  if (!state?.published_revision)
    throw new Error("The real athlete-state worker did not publish a baseline.");

  const selected = await input.e2eData.activityPlans.create({
    actorEmail: input.actor.email,
    label: "scenario-selected",
  });
  const substitute = await input.e2eData.activityPlans.create({
    actorEmail: input.actor.email,
    label: "scenario-substitute",
  });
  const operationId = input.identity.suffix("scenario-session", 32);
  const response = await input.actor.request.post("/api/trpc/plannedSessions.create?batch=1", {
    data: {
      0: {
        json: {
          profileId: input.actor.profileId,
          session: {
            activityPlanId: selected.id,
            planningDate: date,
            source: { kind: "direct", operationId },
          },
        },
      },
    },
  });
  if (!response.ok())
    throw new Error(`Scenario session fixture failed with HTTP ${response.status()}.`);
  const horizonResponse = await input.actor.request.post(
    "/api/trpc/plannedSessions.create?batch=1",
    {
      data: {
        0: {
          json: {
            profileId: input.actor.profileId,
            session: {
              activityPlanId: selected.id,
              planningDate: horizonDate,
              source: {
                kind: "direct",
                operationId: input.identity.suffix("scenario-horizon-session", 32),
              },
            },
          },
        },
      },
    },
  );
  if (!horizonResponse.ok())
    throw new Error(
      `Scenario horizon session fixture failed with HTTP ${horizonResponse.status()}.`,
    );
  const [session] = await input.database.db
    .select({ id: plannedSessions.id, revision: plannedSessions.session_revision })
    .from(plannedSessions)
    .where(
      and(
        eq(plannedSessions.profile_id, input.actor.profileId),
        eq(plannedSessions.idempotency_key, `direct:${operationId}`),
      ),
    )
    .limit(1);
  const [plan] = await input.database.db
    .select({ revision: activityPlans.revision })
    .from(activityPlans)
    .where(eq(activityPlans.id, selected.id))
    .limit(1);
  if (!session || !plan) throw new Error("Scenario fixture records were not persisted.");
  return {
    activityPlanId: selected.id,
    activityPlanRevision: plan.revision,
    date,
    horizonDate,
    sessionId: session.id,
    sessionCount: 2,
    sessionRevision: session.revision,
    operationReceiptCount: async (operationId) =>
      (
        await input.database.db
          .select({ id: chatbotOperationReceipts.id })
          .from(chatbotOperationReceipts)
          .where(
            and(
              eq(chatbotOperationReceipts.profile_id, input.actor.profileId),
              eq(chatbotOperationReceipts.operation_id, operationId),
            ),
          )
      ).length,
    operationReceiptsForSession: async (sessionId) =>
      (
        await input.database.db
          .select({
            command: chatbotOperationReceipts.command,
            operationId: chatbotOperationReceipts.operation_id,
            result: chatbotOperationReceipts.result,
          })
          .from(chatbotOperationReceipts)
          .where(eq(chatbotOperationReceipts.profile_id, input.actor.profileId))
      ).flatMap((receipt) => {
        return receiptResultReferencesSession(receipt.result, sessionId)
          ? [{ command: receipt.command, operationId: receipt.operationId }]
          : [];
      }),
    stateRevision: state.published_revision,
    substituteId: substitute.id,
    substituteName: substitute.name,
    snapshot: () => readScenarioRows(input.database, input.actor.profileId),
  };
}
