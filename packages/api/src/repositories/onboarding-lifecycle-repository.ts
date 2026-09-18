import { createHash } from "node:crypto";
import {
  type ExecutableIntegrationProviderId,
  executableIntegrationProviderIdSchema,
  type ProfileGoalCreate,
  profileGoalRecordSchema,
} from "@repo/core";
import type { OnboardingStatus } from "@repo/core/schemas/onboarding";
import {
  activityImportRuns,
  integrationCredentials,
  integrations,
  oauthStates,
  profileAthleteState,
  profileGoals,
  profileMetrics,
  profiles,
  providerSyncJobs,
} from "@repo/db";
import { and, eq, sql } from "drizzle-orm";
import type { getRequiredDb } from "../db";

type Db = ReturnType<typeof getRequiredDb>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class OnboardingProfileNotFoundForLockError extends Error {
  constructor() {
    super("Profile not found");
  }
}

export class OnboardingGoalContentConflictError extends Error {
  constructor() {
    super("The onboarding goal identity is already bound to different content");
    this.name = "OnboardingGoalContentConflictError";
  }
}

export class OnboardingStatusConflictError extends Error {
  constructor(
    public readonly expected: readonly OnboardingStatus[],
    public readonly actual: OnboardingStatus,
  ) {
    super(`Onboarding status ${actual} does not permit this operation`);
    this.name = "OnboardingStatusConflictError";
  }
}

export class OnboardingReadinessBarrierError extends Error {
  constructor() {
    super("Onboarding processing is not ready for finalization");
    this.name = "OnboardingReadinessBarrierError";
  }
}

export class OnboardingPendingOAuthError extends Error {
  constructor() {
    super("Finish or cancel the pending provider connection before starting processing");
    this.name = "OnboardingPendingOAuthError";
  }
}

export class OnboardingCompletedReplayConflictError extends Error {
  constructor(public readonly mismatches: readonly string[]) {
    super("Completed onboarding does not match this finalization request");
    this.name = "OnboardingCompletedReplayConflictError";
  }
}

export type OnboardingProviderSnapshot = {
  generation: number;
  id: string;
  provider: ExecutableIntegrationProviderId;
  scope: string | null;
};

export type OnboardingProviderWorkSnapshot = OnboardingProviderSnapshot & {
  active: boolean;
  importRun: {
    failed_count: number;
    imported_count: number;
    material_change_count: number;
    skipped_count: number;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
  } | null;
  jobs: Array<{
    id: string;
    import_run_id: string | null;
    job_type: string;
    last_error: string | null;
    payload_import_run_id: string | null;
    status: string;
  }>;
};

export type OnboardingReadinessSnapshot = {
  athleteState: {
    dirty_from_at?: Date | null;
    published_revision: number;
    source_revision: number;
  } | null;
  profile: { id: string; onboarding_status: OnboardingStatus };
  providers: OnboardingProviderWorkSnapshot[];
};

export async function readLockedFinalOnboardingState(tx: Transaction, profileId: string) {
  const [profile] = await tx
    .select({
      dob: profiles.dob,
      full_name: profiles.full_name,
      gender: profiles.gender,
      onboarding_status: profiles.onboarding_status,
      planning_timezone: profiles.planning_timezone,
      username: profiles.username,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1)
    .for("update");
  if (!profile) throw new OnboardingProfileNotFoundForLockError();
  const [goal] = await tx
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(eq(profileGoals.id, getOnboardingGoalId(profileId)))
    .limit(1);
  const metrics = await tx
    .select({
      calculation_version: profileMetrics.calculation_version,
      method: profileMetrics.method,
      metric_type: profileMetrics.metric_type,
      provenance: profileMetrics.provenance,
      source: profileMetrics.source,
      unit: profileMetrics.unit,
      value: profileMetrics.value,
    })
    .from(profileMetrics)
    .where(
      and(
        eq(profileMetrics.profile_id, profileId),
        eq(profileMetrics.calculation_version, "onboarding-v1"),
      ),
    );
  return {
    goal: goal ? profileGoalRecordSchema.parse(goal) : null,
    metrics,
    profile,
  };
}

export function onboardingGoalMatches(stored: ProfileGoalCreate, requested: ProfileGoalCreate) {
  return canonicalGoalContent(stored) === canonicalGoalContent(requested);
}

export function completedOnboardingReplayMatches(input: {
  goalMatches: boolean;
  metricsMatch: boolean;
  profileMatches: boolean;
}) {
  return input.goalMatches && input.metricsMatch && input.profileMatches;
}

export async function readOnboardingProfileState(db: Db, profileId: string) {
  const [row] = await db
    .select({ id: profiles.id, onboarding_status: profiles.onboarding_status })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  return row ?? null;
}

export async function lockOnboardingProfile(tx: Transaction, profileId: string) {
  const [row] = await tx
    .select({ id: profiles.id, onboarding_status: profiles.onboarding_status })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1)
    .for("update");

  if (!row) throw new OnboardingProfileNotFoundForLockError();
  return row;
}

export async function listExecutableOnboardingProviders(
  tx: Transaction,
  profileId: string,
): Promise<OnboardingProviderSnapshot[]> {
  const rows = await tx
    .select({
      generation: integrations.generation,
      id: integrations.id,
      provider: integrations.provider,
      scope: integrationCredentials.scope,
    })
    .from(integrations)
    .innerJoin(integrationCredentials, eq(integrationCredentials.integration_id, integrations.id))
    .where(
      and(eq(integrations.profile_id, profileId), eq(integrations.lifecycle_status, "active")),
    );

  return rows.flatMap((row) => {
    const provider = executableIntegrationProviderIdSchema.safeParse(row.provider);
    return provider.success ? [{ ...row, provider: provider.data }] : [];
  });
}

export async function hasPendingOnboardingOAuthState(
  tx: Transaction,
  profileId: string,
  now = new Date(),
): Promise<boolean> {
  const [state] = await tx
    .select({ id: oauthStates.id })
    .from(oauthStates)
    .where(and(eq(oauthStates.profile_id, profileId), sql`${oauthStates.expires_at} > ${now}`))
    .limit(1)
    .for("update");
  return Boolean(state);
}

export async function setOnboardingStatus(
  tx: Transaction,
  profileId: string,
  onboardingStatus: OnboardingStatus,
) {
  const [updated] = await tx
    .update(profiles)
    .set({ onboarding_status: onboardingStatus, updated_at: new Date() })
    .where(eq(profiles.id, profileId))
    .returning({ id: profiles.id });
  if (!updated) throw new OnboardingProfileNotFoundForLockError();
}

export async function readOnboardingReadinessSnapshot(
  db: Db | Transaction,
  profileId: string,
): Promise<OnboardingReadinessSnapshot | null> {
  const [profile] = await db
    .select({ id: profiles.id, onboarding_status: profiles.onboarding_status })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  if (!profile) return null;

  // The onboarding trigger on the generation-fenced jobs is the durable work-set anchor. Do not
  // rediscover active integrations here: doing so would let disconnects or unrelated newer work
  // silently change what onboarding is waiting for.
  const jobRows = await db
    .select({
      active: sql<boolean>`${integrations.lifecycle_status} = 'active'`,
      generation: providerSyncJobs.integration_generation,
      id: providerSyncJobs.integration_id,
      import_run_id: providerSyncJobs.import_run_id,
      job_id: providerSyncJobs.id,
      job_type: providerSyncJobs.job_type,
      last_error: providerSyncJobs.last_error,
      payload_import_run_id: sql<string | null>`${providerSyncJobs.payload}->>'importRunId'`,
      provider: providerSyncJobs.provider,
      scope: integrationCredentials.scope,
      status: providerSyncJobs.status,
    })
    .from(providerSyncJobs)
    .innerJoin(integrations, eq(integrations.id, providerSyncJobs.integration_id))
    .leftJoin(integrationCredentials, eq(integrationCredentials.integration_id, integrations.id))
    .where(
      and(
        eq(providerSyncJobs.profile_id, profileId),
        sql`${providerSyncJobs.payload}->>'trigger' = 'onboarding'`,
        sql`${providerSyncJobs.last_error} is distinct from 'onboarding_selection_restarted'`,
      ),
    );
  const grouped = new Map<string, OnboardingProviderWorkSnapshot>();
  for (const row of jobRows) {
    const providerId = executableIntegrationProviderIdSchema.safeParse(row.provider);
    if (!providerId.success) continue;
    const key = `${providerId.data}:${row.id}:${row.generation}`;
    const current = grouped.get(key) ?? {
      active: row.active,
      generation: row.generation,
      id: row.id,
      provider: providerId.data,
      scope: row.scope,
      importRun: null,
      jobs: [],
    };
    current.jobs.push({
      id: row.job_id,
      import_run_id: row.import_run_id,
      job_type: row.job_type,
      last_error: row.last_error,
      payload_import_run_id: row.payload_import_run_id,
      status: row.status,
    });
    grouped.set(key, current);
  }
  const executableProviders = [...grouped.values()];
  const providers = await Promise.all(
    executableProviders.map(async (provider) => {
      // Load the generation-fenced onboarding import linked by persisted job identity. Deciding
      // which job owns the history role belongs to the provider adapter in the application layer.
      const importJob = provider.jobs.find(
        (job) => job.import_run_id !== null && job.import_run_id === job.payload_import_run_id,
      );
      const [importRun] = importJob?.import_run_id
        ? await db
            .select({
              failed_count: activityImportRuns.failed_count,
              imported_count: activityImportRuns.imported_count,
              material_change_count: activityImportRuns.material_change_count,
              skipped_count: activityImportRuns.skipped_count,
              status: activityImportRuns.status,
            })
            .from(activityImportRuns)
            .where(
              and(
                eq(activityImportRuns.id, importJob.import_run_id),
                eq(activityImportRuns.profile_id, profileId),
                eq(activityImportRuns.integration_id, provider.id),
                eq(activityImportRuns.integration_generation, provider.generation),
                eq(activityImportRuns.kind, "onboarding"),
              ),
            )
            .limit(1)
        : [];
      return { ...provider, importRun: importRun ?? null };
    }),
  );
  const [athleteState] = await db
    .select({
      dirty_from_at: profileAthleteState.dirty_from_at,
      published_revision: profileAthleteState.published_revision,
      source_revision: profileAthleteState.source_revision,
    })
    .from(profileAthleteState)
    .where(eq(profileAthleteState.profile_id, profileId))
    .limit(1);

  return { athleteState: athleteState ?? null, profile, providers };
}

/** RFC 4122 version-5 UUID derived from the lifecycle profile and a server-owned label. */
export function getOnboardingGoalId(profileId: string): string {
  const bytes = createHash("sha1")
    .update("gradientpeak:onboarding-goal:v1:")
    .update(profileId.toLowerCase())
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes.readUInt8(6) & 0x0f) | 0x50;
  bytes[8] = (bytes.readUInt8(8) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalGoalContent(goal: ProfileGoalCreate) {
  return canonicalJson({
    profile_id: goal.profile_id,
    target_date: goal.target_date,
    title: goal.title,
    priority: goal.priority,
    activity_category: goal.activity_category,
    target_payload: goal.target_payload,
  });
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export async function saveIdempotentOnboardingGoal(db: Db | Transaction, goal: ProfileGoalCreate) {
  const id = getOnboardingGoalId(goal.profile_id);
  const now = new Date();

  await db
    .insert(profileGoals)
    .values({ id, ...goal, created_at: now, updated_at: now })
    .onConflictDoNothing({ target: profileGoals.id });

  const [storedRow] = await db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
    })
    .from(profileGoals)
    .where(eq(profileGoals.id, id))
    .limit(1);
  const stored = profileGoalRecordSchema.parse(storedRow);

  if (canonicalGoalContent(stored) !== canonicalGoalContent(goal)) {
    throw new OnboardingGoalContentConflictError();
  }

  return stored;
}
