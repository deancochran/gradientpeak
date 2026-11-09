import { activityImportRuns, activitySourceReferences } from "@repo/db";
import { and, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { DrizzleTransactionClient, getRequiredDb } from "../db";
import { markAthleteStateDirty } from "./athlete-state-repository";
import { lockProfileAdvisoryFence } from "./profile-advisory-fence";

type DbClient = ReturnType<typeof getRequiredDb>;

export type ActivityImportKind = "onboarding" | "history_sync" | "manual_sync";
const bulkImportKinds: ActivityImportKind[] = ["onboarding", "history_sync", "manual_sync"];
const MAX_SKIPPED_DIAGNOSTICS = 120;

export const activityImportSkipReasonCodes = [
  "already_imported",
  "unsupported_activity_file",
  "unsupported_activity_invariant",
  "canonical_identity_mismatch",
  "canonical_evidence_unchanged",
  "activity_import_failed",
  "unspecified",
] as const;

export type ActivityImportSkipReasonCode = (typeof activityImportSkipReasonCodes)[number];

export type ActivityImportSkipDiagnostic = {
  providerExternalId: string;
  reason: ActivityImportSkipReasonCode;
};

function assertSkippedDiagnostics(
  diagnostics: readonly ActivityImportSkipDiagnostic[],
): readonly ActivityImportSkipDiagnostic[] {
  if (diagnostics.length > 30) throw new Error("Too many skipped activity diagnostics in one page");
  for (const diagnostic of diagnostics) {
    if (!/^\d{1,20}$/.test(diagnostic.providerExternalId)) {
      throw new Error("Skipped activity diagnostic has an invalid provider external ID");
    }
    if (!activityImportSkipReasonCodes.includes(diagnostic.reason)) {
      throw new Error("Skipped activity diagnostic has an invalid reason code");
    }
  }
  return diagnostics;
}

type RecordActivityImportPageInput = {
  id: string;
  discovered: number;
  imported: number;
  skipped: number;
  skippedDiagnostics?: readonly ActivityImportSkipDiagnostic[];
  failed: number;
  earliestActivityAt: Date | null;
  lastErrorCode?: string;
  latestActivityAt: Date | null;
  nextCursor?: string | null;
  nextPage?: number | null;
  now?: Date;
};

export function createActivityImportRepository(db: DbClient) {
  const recordPage = async (tx: DrizzleTransactionClient, input: RecordActivityImportPageInput) => {
    const now = input.now ?? new Date();
    const skippedDiagnostics = assertSkippedDiagnostics(input.skippedDiagnostics ?? []);
    const skippedDiagnosticsJson = JSON.stringify(skippedDiagnostics);
    const lastErrorCode = input.lastErrorCode;
    if (lastErrorCode && !/^[a-z][a-z0-9_]{0,63}$/.test(lastErrorCode)) {
      throw new Error("Activity import run error code must be a bounded safe code");
    }
    const [pageRecorded] = await tx
      .update(activityImportRuns)
      .set({
        discovered_count: sql`${activityImportRuns.discovered_count} + ${input.discovered}`,
        imported_count: sql`${activityImportRuns.imported_count} + ${input.imported}`,
        skipped_count: sql`${activityImportRuns.skipped_count} + ${input.skipped}`,
        skipped_diagnostics:
          skippedDiagnostics.length === 0
            ? undefined
            : sql`(
                select coalesce(jsonb_agg(value), '[]'::jsonb)
                from (
                  select value
                  from jsonb_array_elements(
                    ${activityImportRuns.skipped_diagnostics} || ${skippedDiagnosticsJson}::jsonb
                  ) with ordinality as diagnostic(value, ordinal)
                  order by ordinal
                  limit ${MAX_SKIPPED_DIAGNOSTICS}
                ) as bounded_diagnostics
              )`,
        failed_count: sql`${activityImportRuns.failed_count} + ${input.failed}`,
        last_error_code: lastErrorCode,
        earliest_activity_at: input.earliestActivityAt
          ? sql`least(coalesce(${activityImportRuns.earliest_activity_at}, ${input.earliestActivityAt}), ${input.earliestActivityAt})`
          : undefined,
        latest_activity_at: input.latestActivityAt
          ? sql`greatest(coalesce(${activityImportRuns.latest_activity_at}, ${input.latestActivityAt}), ${input.latestActivityAt})`
          : undefined,
        next_cursor: input.nextCursor ?? null,
        next_page: input.nextPage ?? null,
        updated_at: now,
      })
      .where(and(eq(activityImportRuns.id, input.id), eq(activityImportRuns.status, "running")))
      .returning();
    if (!pageRecorded) throw new Error("Activity import run page advancement lost ownership");
    const [material] = await tx
      .select({
        count: sql<number>`count(distinct ${activitySourceReferences.activity_id})::integer`,
        earliest: sql<Date | null>`min(${activitySourceReferences.last_material_effective_at})`,
      })
      .from(activitySourceReferences)
      .where(eq(activitySourceReferences.last_material_import_run_id, input.id));
    if (!material || material.count === 0) return pageRecorded;
    const [run] = await tx
      .update(activityImportRuns)
      .set({
        material_change_count: sql`greatest(${activityImportRuns.material_change_count}, ${material.count})`,
        material_effective_from_at: material.earliest
          ? sql`least(coalesce(${activityImportRuns.material_effective_from_at}, ${material.earliest}), ${material.earliest})`
          : undefined,
        updated_at: now,
      })
      .where(and(eq(activityImportRuns.id, input.id), eq(activityImportRuns.status, "running")))
      .returning();
    if (!run) throw new Error("Activity import material bookkeeping lost ownership");
    return run;
  };

  const repository = {
    async create(input: {
      profileId: string;
      integrationId?: string;
      integrationGeneration?: number;
      kind: ActivityImportKind;
      windowStartAt?: Date;
      windowEndAt?: Date;
      nextCursor?: string;
      nextPage?: number;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      return db.transaction(async (tx) => {
        // Lock order: profile advisory fence, then import-run row locks/inserts.
        await lockProfileAdvisoryFence(tx, input.profileId);
        const [existing] = await tx
          .select()
          .from(activityImportRuns)
          .where(
            and(
              eq(activityImportRuns.profile_id, input.profileId),
              eq(activityImportRuns.kind, input.kind),
              inArray(activityImportRuns.status, ["queued", "running", "failed"]),
              isNull(activityImportRuns.superseded_at),
              input.integrationId === undefined
                ? isNull(activityImportRuns.integration_id)
                : eq(activityImportRuns.integration_id, input.integrationId),
              input.integrationGeneration === undefined
                ? isNull(activityImportRuns.integration_generation)
                : eq(activityImportRuns.integration_generation, input.integrationGeneration),
            ),
          )
          .limit(1)
          .for("update");
        if (existing) return existing;
        const [run] = await tx
          .insert(activityImportRuns)
          .values({
            profile_id: input.profileId,
            integration_id: input.integrationId,
            integration_generation: input.integrationGeneration,
            kind: input.kind,
            status: "queued",
            window_start_at: input.windowStartAt,
            window_end_at: input.windowEndAt,
            next_cursor: input.nextCursor,
            next_page: input.nextPage,
            created_at: now,
            updated_at: now,
          })
          .returning();
        if (!run) throw new Error("Activity import run creation failed");
        return run;
      });
    },

    async start(id: string, now = new Date()) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select()
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1);
        if (!candidate) return null;
        await lockProfileAdvisoryFence(tx, candidate.profile_id);
        const [lockedCandidate] = await tx
          .select()
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1)
          .for("update");
        if (!lockedCandidate) return null;
        if (lockedCandidate.status === "running") return lockedCandidate;
        if (lockedCandidate.status !== "queued") return null;
        const [otherRunning] = await tx
          .select({ id: activityImportRuns.id })
          .from(activityImportRuns)
          .where(
            and(
              eq(activityImportRuns.profile_id, lockedCandidate.profile_id),
              inArray(activityImportRuns.kind, bulkImportKinds),
              eq(activityImportRuns.status, "running"),
              ne(activityImportRuns.id, id),
            ),
          )
          .limit(1);
        if (otherRunning) return null;
        const [run] = await tx
          .update(activityImportRuns)
          .set({ status: "running", started_at: now, updated_at: now })
          .where(and(eq(activityImportRuns.id, id), eq(activityImportRuns.status, "queued")))
          .returning();
        return run ?? null;
      });
    },

    async resume(id: string, now = new Date()) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select()
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1);
        if (!candidate || candidate.status !== "failed" || candidate.superseded_at !== null)
          return null;
        await lockProfileAdvisoryFence(tx, candidate.profile_id);
        const [lockedCandidate] = await tx
          .select()
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1)
          .for("update");
        if (
          !lockedCandidate ||
          lockedCandidate.status !== "failed" ||
          lockedCandidate.superseded_at !== null
        )
          return null;
        const [otherRunning] = await tx
          .select({ id: activityImportRuns.id })
          .from(activityImportRuns)
          .where(
            and(
              eq(activityImportRuns.profile_id, lockedCandidate.profile_id),
              inArray(activityImportRuns.kind, bulkImportKinds),
              eq(activityImportRuns.status, "running"),
              ne(activityImportRuns.id, id),
            ),
          )
          .limit(1);
        if (otherRunning) return null;
        const [run] = await tx
          .update(activityImportRuns)
          .set({
            status: "running",
            completed_at: null,
            last_error_code: null,
            updated_at: now,
          })
          .where(and(eq(activityImportRuns.id, id), eq(activityImportRuns.status, "failed")))
          .returning();
        return run ?? null;
      });
    },

    async read(id: string) {
      const [run] = await db
        .select()
        .from(activityImportRuns)
        .where(eq(activityImportRuns.id, id))
        .limit(1);
      return run ?? null;
    },

    recordPage,

    async recordPageCommitted(input: RecordActivityImportPageInput) {
      return db.transaction((tx) => recordPage(tx, input));
    },

    async complete(
      id: string,
      now = new Date(),
      beforeComplete?: (
        tx: DrizzleTransactionClient,
        run: typeof activityImportRuns.$inferSelect,
      ) => Promise<void>,
    ) {
      return db.transaction(async (tx) => {
        const [candidate] = await tx
          .select({ profileId: activityImportRuns.profile_id })
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1);
        if (!candidate) return null;
        await lockProfileAdvisoryFence(tx, candidate.profileId);
        const [locked] = await tx
          .select()
          .from(activityImportRuns)
          .where(eq(activityImportRuns.id, id))
          .limit(1)
          .for("update");
        if (!locked || locked.status !== "running") return null;
        await beforeComplete?.(tx, locked);
        const [run] = await tx
          .update(activityImportRuns)
          .set({
            status: "completed",
            completed_at: now,
            next_cursor: null,
            next_page: null,
            last_error_code: locked.failed_count > 0 ? locked.last_error_code : null,
            updated_at: now,
          })
          .where(and(eq(activityImportRuns.id, id), eq(activityImportRuns.status, "running")))
          .returning();
        if (!run) return null;
        if (run.failed_count === 0 && run.window_start_at !== null && run.window_end_at !== null) {
          await tx
            .update(activityImportRuns)
            .set({ superseded_by_run_id: run.id, superseded_at: now, updated_at: now })
            .where(
              and(
                eq(activityImportRuns.profile_id, run.profile_id),
                eq(activityImportRuns.status, "failed"),
                isNull(activityImportRuns.superseded_at),
                ne(activityImportRuns.id, run.id),
                sql`${activityImportRuns.integration_id} is not distinct from ${run.integration_id}::uuid`,
                sql`${activityImportRuns.window_start_at} is not null`,
                sql`${activityImportRuns.window_end_at} is not null`,
                lte(activityImportRuns.window_start_at, activityImportRuns.window_end_at),
                sql`${run.window_start_at}::timestamptz <= ${activityImportRuns.window_start_at}`,
                sql`${run.window_end_at}::timestamptz >= ${activityImportRuns.window_end_at}`,
              ),
            );
        }
        if (run.material_change_count > 0) {
          await markAthleteStateDirty(tx, {
            profileId: run.profile_id,
            effectiveAt: run.material_effective_from_at ?? run.earliest_activity_at ?? now,
            now,
          });
        }
        return run;
      });
    },

    async fail(id: string, errorCode: string, now = new Date()) {
      return db.transaction(async (tx) => {
        const [run] = await tx
          .update(activityImportRuns)
          .set({
            status: "failed",
            completed_at: now,
            last_error_code: errorCode.slice(0, 64),
            updated_at: now,
          })
          .where(
            and(
              eq(activityImportRuns.id, id),
              sql`${activityImportRuns.status} in ('queued', 'running')`,
            ),
          )
          .returning();
        if (!run) return null;

        // A failed history import can still have committed material activity evidence from earlier
        // pages. Publish that verified partial history as stale rather than leaving the profile
        // without any athlete-state baseline until a later import fully succeeds.
        if (run.material_change_count > 0) {
          await markAthleteStateDirty(tx, {
            profileId: run.profile_id,
            effectiveAt: run.material_effective_from_at ?? run.earliest_activity_at ?? now,
            now,
          });
        }
        return run;
      });
    },
  };
  return repository;
}
