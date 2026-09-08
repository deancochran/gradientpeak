import { importStravaActivity } from "../../application/activities/import-strava-activity";
import { submitActivity } from "../../application/activities/submit-activity";
import {
  STRAVA_ACTIVITY_HISTORY_JOB,
  stravaProviderOperationAdapter,
} from "../../application/integrations/strava-provider-operation-adapter";
import { reconcileOnboardingStatus } from "../../application/onboarding/readiness";
import type { getRequiredDb } from "../../db";
import type { createActivityImportRepository } from "../../repositories/activity-import-repository";
import type { StravaRepository, StravaSyncJobRecord } from "../../repositories/strava-repository";
import { isStravaIntegrationEnabled } from "../integrations/oauth-config";
import {
  StravaClient,
  StravaClientError,
  type StravaRateLimit,
} from "../integrations/strava/client";
import {
  resolveStravaAccessToken,
  StravaAuthorizationRequiredError,
} from "../integrations/strava/credentials";

export const STRAVA_HISTORY_WINDOW_DAYS = 90;
export const STRAVA_HISTORY_MAX_ACTIVITIES = 100;
const STRAVA_DISCONNECT_JOB = "strava.disconnect";
const PAGE_SIZE = 30;

type StravaHistoryPayload = {
  activityExternalId?: string;
  importRunId?: string;
  reviewSourceReferenceId?: string;
  trigger: "connect" | "manual" | "onboarding";
};

type StravaHistoryClient = Pick<
  StravaClient,
  "getActivity" | "getActivityStreams" | "listAthleteActivitiesPage"
>;

function validPayload(value: unknown): value is StravaHistoryPayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "trigger" in value &&
      (value.trigger === "connect" ||
        value.trigger === "manual" ||
        value.trigger === "onboarding") &&
      (!("importRunId" in value) ||
        value.importRunId === undefined ||
        typeof value.importRunId === "string") &&
      (!("activityExternalId" in value) ||
        value.activityExternalId === undefined ||
        typeof value.activityExternalId === "string") &&
      (!("reviewSourceReferenceId" in value) ||
        value.reviewSourceReferenceId === undefined ||
        typeof value.reviewSourceReferenceId === "string"),
  );
}

function assertRequestBudget(rateLimit: StravaRateLimit | null, requestsNeeded: number): void {
  if (
    rateLimit &&
    (rateLimit.remaining15Minute < requestsNeeded || rateLimit.remainingDaily < requestsNeeded)
  ) {
    throw new StravaClientError("rate_limited", {
      rateLimit,
      retryAfterSeconds: rateLimit.remainingDaily < requestsNeeded ? 3_600 : 15 * 60,
    });
  }
}

function retryAt(error: unknown, attempt: number): string | undefined {
  if (error instanceof StravaClientError && error.kind === "rate_limited") {
    return new Date(
      Date.now() + (error.details.retryAfterSeconds ?? 15 * 60) * 1_000,
    ).toISOString();
  }
  if (
    error instanceof StravaClientError &&
    ["network_unavailable", "provider_unavailable", "request_timeout"].includes(error.kind)
  ) {
    return new Date(
      Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempt, 6)),
    ).toISOString();
  }
  return undefined;
}

function safeFailureCode(error: unknown): string {
  if (error instanceof StravaAuthorizationRequiredError) return "strava_authorization_required";
  if (error instanceof StravaClientError) return `strava_${error.kind}`;
  if (error instanceof Error && error.message === "strava_activity_owner_mismatch") {
    return "strava_activity_owner_mismatch";
  }
  return "strava_history_failed";
}

function assertActivityOwner(
  activity: { athlete: { id: string | number } },
  integrationExternalId: string,
): void {
  if (String(activity.athlete.id) !== integrationExternalId) {
    throw new Error("strava_activity_owner_mismatch");
  }
}

export class StravaActivityHistoryJobService {
  constructor(
    private readonly deps: {
      db: ReturnType<typeof getRequiredDb>;
      importRuns: ReturnType<typeof createActivityImportRepository>;
      repository: StravaRepository;
      clientFactory?: (accessToken: string) => StravaHistoryClient;
      deauthorize?: (accessToken: string) => Promise<void>;
      reconcileOnboardingStatus?: typeof reconcileOnboardingStatus;
      submitCanonicalActivity?: typeof submitActivity;
      now?: () => Date;
    },
  ) {}

  async processDueJobs(
    input: { leaseMs?: number; limit?: number; workerId?: string } = {},
  ): Promise<{ completed: number; failed: number; processed: number }> {
    if (!isStravaIntegrationEnabled()) return { completed: 0, failed: 0, processed: 0 };
    const now = (this.deps.now ?? (() => new Date()))();
    const leaseMs = Math.min(30 * 60_000, Math.max(60_000, input.leaseMs ?? 10 * 60_000));
    const workerId = `${input.workerId ?? "strava-worker"}:${crypto.randomUUID()}`;
    const jobs = await this.deps.repository.claimDueJobs({
      jobTypes: [STRAVA_ACTIVITY_HISTORY_JOB, STRAVA_DISCONNECT_JOB],
      limit: Math.min(5, Math.max(1, Math.floor(input.limit ?? 2))),
      lockExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
      now: now.toISOString(),
      workerId,
    });
    let completed = 0;
    let failed = 0;
    for (const job of jobs) {
      const outcome =
        job.jobType === STRAVA_DISCONNECT_JOB
          ? await this.processDisconnect(job, workerId)
          : await this.processHistory(job, workerId, leaseMs);
      if (outcome) completed += 1;
      else failed += 1;
    }
    return { completed, failed, processed: jobs.length };
  }

  private async processDisconnect(job: StravaSyncJobRecord, workerId: string): Promise<boolean> {
    const attempt = await this.deps.repository.beginProviderDisconnectAttempt({
      generation: job.integrationGeneration,
      integrationId: job.integrationId,
      jobId: job.id,
      provider: "strava",
      workerId,
    });
    if (!attempt) return false;
    if (attempt.disposition === "superseded") {
      return this.deps.repository.markJobSucceeded({ id: job.id, workerId });
    }
    if (attempt.disposition === "invalid") {
      return this.deps.repository.finalizeProviderDisconnect({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        jobId: job.id,
        outcome: "dead_lettered",
        provider: "strava",
        workerId,
      });
    }
    try {
      const deauthorize =
        this.deps.deauthorize ?? stravaProviderOperationAdapter.deauthorizeAccessToken;
      if (!deauthorize) throw new Error("Strava deauthorization adapter is unavailable");
      await deauthorize(attempt.accessToken);
      return this.deps.repository.finalizeProviderDisconnect({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        jobId: job.id,
        outcome: "confirmed",
        provider: "strava",
        workerId,
      });
    } catch {
      return this.deps.repository.finalizeProviderDisconnect({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        jobId: job.id,
        outcome: job.attempt >= job.maxAttempts ? "dead_lettered" : "retry",
        provider: "strava",
        workerId,
      });
    }
  }

  private async processHistory(
    job: StravaSyncJobRecord,
    workerId: string,
    leaseMs: number,
  ): Promise<boolean> {
    if (!validPayload(job.payload)) {
      return this.deps.repository.failJob({
        id: job.id,
        lastError: "strava_invalid_history_payload",
        status: "dead_lettered",
        workerId,
      });
    }
    if (
      !(await (this.deps.repository.isIntegrationGenerationActive?.({
        generation: job.integrationGeneration,
        integrationId: job.integrationId,
        profileId: job.profileId,
      }) ?? false))
    ) {
      return this.deps.repository.markJobSucceeded({ id: job.id, workerId });
    }

    let importRunId = job.importRunId ?? job.payload.importRunId;
    try {
      const integration = await this.deps.repository.findIntegrationByProfileId(job.profileId);
      if (
        !integration ||
        integration.id !== job.integrationId ||
        integration.integrationGeneration !== job.integrationGeneration ||
        !new Set((integration.scope ?? "").split(/[\s,]+/).filter(Boolean)).has("activity:read_all")
      ) {
        throw new StravaAuthorizationRequiredError();
      }
      if (job.payload.activityExternalId && job.payload.reviewSourceReferenceId) {
        // A worker can crash after the submission transaction commits but before it marks this
        // job complete. The source state is the durable completion marker, so replay converges
        // without issuing a second materialization.
        const persisted = await this.deps.repository.findDirectActivitySource({
          profileId: job.profileId,
          providerExternalId: job.payload.activityExternalId,
        });
        if (persisted?.resolutionStatus !== "review") {
          return this.deps.repository.completeHistoryJob({
            expectedIntegrationGeneration: job.integrationGeneration,
            highWatermark: (this.deps.now ?? (() => new Date()))().toISOString(),
            id: job.id,
            integrationId: job.integrationId,
            metadata: { explicit_owner_keep_separate: true, recovered_materialization: true },
            workerId,
          });
        }
        const accessToken = await resolveStravaAccessToken({
          integration,
          repository: this.deps.repository,
        });
        const client = (
          this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
        )(accessToken);
        const externalId = job.payload.activityExternalId;
        const detailResult = await client.getActivity(externalId);
        assertActivityOwner(detailResult.data, integration.externalId);
        assertRequestBudget(detailResult.rateLimit, 1);
        const streamResult = await client.getActivityStreams(externalId);
        await importStravaActivity(
          {
            activity: detailResult.data,
            db: this.deps.db,
            integrationGeneration: job.integrationGeneration,
            integrationId: job.integrationId,
            profileId: job.profileId,
            providerUpdatedAt: null,
            reviewSourceReferenceId: job.payload.reviewSourceReferenceId,
            streams: streamResult.data,
          },
          { submitCanonicalActivity: this.deps.submitCanonicalActivity ?? submitActivity },
        );
        return this.deps.repository.completeHistoryJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          highWatermark: (this.deps.now ?? (() => new Date()))().toISOString(),
          id: job.id,
          integrationId: job.integrationId,
          metadata: { explicit_owner_keep_separate: true },
          workerId,
        });
      }
      let endAt = (this.deps.now ?? (() => new Date()))();
      let startAt = new Date(endAt.getTime() - STRAVA_HISTORY_WINDOW_DAYS * 86_400_000);
      if (!importRunId) {
        const run = await this.deps.importRuns.create({
          profileId: job.profileId,
          integrationId: job.integrationId,
          integrationGeneration: job.integrationGeneration,
          kind:
            job.payload.trigger === "onboarding"
              ? "onboarding"
              : job.payload.trigger === "manual"
                ? "manual_sync"
                : "history_sync",
          windowStartAt: startAt,
          windowEndAt: endAt,
        });
        importRunId = run.id;
        const payload = { ...job.payload, importRunId };
        const bound = await this.deps.repository.bindJobImportRun({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          importRunId,
          payload,
          workerId,
        });
        if (!bound) throw new Error("strava_history_lease_lost");
      }
      const existingRun = await this.deps.importRuns.read(importRunId);
      if (existingRun?.status === "completed") {
        return this.deps.repository.completeHistoryJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          highWatermark: (existingRun.window_end_at ?? endAt).toISOString(),
          id: job.id,
          integrationId: job.integrationId,
          metadata: { recovered_completed_import: true },
          workerId,
        });
      }
      const run =
        existingRun?.status === "failed"
          ? await this.deps.importRuns.resume(importRunId)
          : await this.deps.importRuns.start(importRunId);
      if (!run && existingRun?.status !== "running")
        throw new Error("strava_import_run_unavailable");
      const activeRun = run ?? existingRun;
      if (activeRun?.window_start_at && activeRun.window_end_at) {
        startAt = activeRun.window_start_at;
        endAt = activeRun.window_end_at;
      }

      const accessToken = await resolveStravaAccessToken({
        integration,
        repository: this.deps.repository,
      });
      const client = (
        this.deps.clientFactory ?? ((token) => new StravaClient({ accessToken: token }))
      )(accessToken);
      let page = activeRun?.next_page ?? 1;
      let examined = activeRun?.discovered_count ?? 0;
      let lastRateLimit: StravaRateLimit | null = null;
      const terminalPageCommitted = activeRun?.next_page === null && examined > 0;
      while (!terminalPageCommitted && examined < STRAVA_HISTORY_MAX_ACTIVITIES) {
        const pageResult = await client.listAthleteActivitiesPage({
          after: Math.floor(startAt.getTime() / 1_000),
          before: Math.floor(endAt.getTime() / 1_000),
          page,
          perPage: PAGE_SIZE,
        });
        lastRateLimit = pageResult.rateLimit;
        if (pageResult.data.length === 0) break;
        let imported = 0;
        let skipped = 0;
        let failed = 0;
        let earliestTimestamp: number | null = null;
        let latestTimestamp: number | null = null;
        const pageItems = pageResult.data.slice(0, STRAVA_HISTORY_MAX_ACTIVITIES - examined);
        for (const summary of pageItems) {
          const externalId = String(summary.id);
          const startedAt = new Date(summary.start_date);
          earliestTimestamp =
            earliestTimestamp === null
              ? startedAt.getTime()
              : Math.min(earliestTimestamp, startedAt.getTime());
          latestTimestamp =
            latestTimestamp === null
              ? startedAt.getTime()
              : Math.max(latestTimestamp, startedAt.getTime());
          const direct = await this.deps.repository.findDirectActivitySource({
            profileId: job.profileId,
            providerExternalId: externalId,
          });
          if (direct) {
            skipped += 1;
            examined += 1;
            continue;
          }
          assertRequestBudget(lastRateLimit, 2);
          const renewed = await this.deps.repository.renewJobLease({
            id: job.id,
            lockExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
            workerId,
          });
          if (!renewed) throw new Error("strava_history_lease_lost");
          try {
            const detailResult = await client.getActivity(externalId);
            assertActivityOwner(detailResult.data, integration.externalId);
            lastRateLimit = detailResult.rateLimit;
            assertRequestBudget(lastRateLimit, 1);
            const streamResult = await client.getActivityStreams(externalId);
            lastRateLimit = streamResult.rateLimit;
            const submitted = await importStravaActivity(
              {
                activity: detailResult.data,
                db: this.deps.db,
                importRunId,
                integrationGeneration: job.integrationGeneration,
                integrationId: job.integrationId,
                profileId: job.profileId,
                providerUpdatedAt: null,
                streams: streamResult.data,
              },
              { submitCanonicalActivity: this.deps.submitCanonicalActivity ?? submitActivity },
            );
            if (submitted.noOp || submitted.resolutionStatus === "review") skipped += 1;
            else imported += 1;
          } catch (error) {
            if (error instanceof StravaClientError && error.kind === "activity_missing") {
              skipped += 1;
            } else if (
              error instanceof StravaClientError &&
              ["invalid_response", "request_rejected"].includes(error.kind)
            ) {
              failed += 1;
            } else {
              throw error;
            }
          }
          examined += 1;
        }
        await this.deps.importRuns.recordPageCommitted({
          id: importRunId,
          discovered: pageItems.length,
          imported,
          skipped,
          failed,
          earliestActivityAt: earliestTimestamp === null ? null : new Date(earliestTimestamp),
          latestActivityAt: latestTimestamp === null ? null : new Date(latestTimestamp),
          nextPage:
            pageResult.data.length === PAGE_SIZE && examined < STRAVA_HISTORY_MAX_ACTIVITIES
              ? page + 1
              : null,
          ...(failed > 0 ? { lastErrorCode: "activity_import_failed" } : {}),
        });
        if (pageResult.data.length < PAGE_SIZE) break;
        page += 1;
      }
      await this.deps.importRuns.complete(importRunId);
      const finalized = await this.deps.repository.completeHistoryJob({
        expectedIntegrationGeneration: job.integrationGeneration,
        highWatermark: endAt.toISOString(),
        id: job.id,
        integrationId: job.integrationId,
        metadata: {
          examined,
          max_activities: STRAVA_HISTORY_MAX_ACTIVITIES,
          window_days: STRAVA_HISTORY_WINDOW_DAYS,
        },
        workerId,
      });
      if (finalized && job.payload.trigger === "onboarding") {
        await (this.deps.reconcileOnboardingStatus ?? reconcileOnboardingStatus)({
          db: this.deps.db,
          profileId: job.profileId,
        }).catch(() => undefined);
      }
      return finalized;
    } catch (error) {
      if (importRunId) await this.deps.importRuns.fail(importRunId, safeFailureCode(error));
      const authorization =
        error instanceof StravaAuthorizationRequiredError ||
        (error instanceof StravaClientError && error.kind === "authorization");
      if (authorization) {
        const integration = await this.deps.repository.findIntegrationByProfileId(job.profileId);
        if (integration) {
          await this.deps.repository.markReconnectRequired({
            expectedCredentialGeneration: integration.credentialGeneration,
            expectedIntegrationGeneration: integration.integrationGeneration,
            id: integration.id,
          });
        }
      }
      const nextRunAt = retryAt(error, job.attempt);
      const retryable = Boolean(nextRunAt);
      return this.deps.repository
        .failJob({
          expectedIntegrationGeneration: job.integrationGeneration,
          id: job.id,
          lastError: safeFailureCode(error),
          ...(nextRunAt ? { nextRunAt } : {}),
          status: retryable && job.attempt < job.maxAttempts ? "failed" : "dead_lettered",
          workerId,
        })
        .then(() => false);
    }
  }
}
