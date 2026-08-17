import { type PlannedSession, plannedSessionSchema } from "@repo/core/calendar";
import {
  activities,
  activityPlans,
  groupEvents,
  groupMemberships,
  groups,
  type PlannedSessionRow,
  plannedSessions,
  trainingPlans,
} from "@repo/db";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type {
  PlannedSessionMutation,
  PlannedSessionMutationResult,
} from "../../contracts/planned-sessions";
import type { DrizzleQueryExecutor } from "../../db";
import type {
  CreateOwnedPlannedSessionResult,
  PlannedSessionRepositoryPort,
} from "../../repositories/planned-session-repository-port";

function toInstant(value: Date | string, field: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid database timestamp: ${field}`);
  return date.toISOString();
}

export function mapPlannedSessionRow(row: PlannedSessionRow): PlannedSession {
  const source = (() => {
    switch (row.source_kind) {
      case "direct":
        return { kind: row.source_kind, operationId: row.direct_operation_id };
      case "training_plan":
        return {
          kind: row.source_kind,
          trainingPlanId: row.training_plan_id,
          trainingPlanRevision: row.training_plan_revision,
          sourceSessionKey: row.source_session_key,
        };
      case "recurrence":
        return {
          kind: row.source_kind,
          seriesId: row.series_id,
          occurrenceKey: row.occurrence_key,
        };
    }
  })();
  const lifecycle = (() => {
    switch (row.status) {
      case "scheduled":
        return { status: row.status };
      case "cancelled":
        return {
          status: row.status,
          reason: row.cancellation_reason,
          cancelledAt: toInstant(row.cancelled_at as Date, "cancelled_at"),
        };
      case "completed":
        return {
          status: row.status,
          completion:
            row.completion_state === "linked"
              ? {
                  state: row.completion_state,
                  activityId: row.completed_activity_id,
                  linkedAt: toInstant(row.linked_at as Date, "linked_at"),
                }
              : {
                  state: row.completion_state,
                  linkedAt: toInstant(row.linked_at as Date, "linked_at"),
                  unlinkedAt: toInstant(
                    row.completion_unlinked_at as Date,
                    "completion_unlinked_at",
                  ),
                },
        };
    }
  })();

  return plannedSessionSchema.parse({
    contractVersion: row.contract_version,
    id: row.id,
    profileId: row.profile_id,
    sessionRevision: row.session_revision,
    planningDate: row.planning_date,
    originalTargetDate: row.original_target_date,
    source,
    idempotencyKey: row.idempotency_key,
    groupEventId: row.group_event_id,
    prescription: {
      activityPlanId: row.activity_plan_id,
      activityPlanRevision: row.activity_plan_revision,
      structure: row.prescription_structure,
      prescriptionQuantification: row.prescription_quantification,
      capturedAt: toInstant(row.prescription_captured_at, "prescription_captured_at"),
    },
    lifecycle,
  });
}

function sessionValues(session: PlannedSession) {
  const sourceValues =
    session.source.kind === "direct"
      ? {
          source_kind: session.source.kind,
          direct_operation_id: session.source.operationId,
          training_plan_id: null,
          training_plan_revision: null,
          source_session_key: null,
          series_id: null,
          occurrence_key: null,
        }
      : session.source.kind === "training_plan"
        ? {
            source_kind: session.source.kind,
            direct_operation_id: null,
            training_plan_id: session.source.trainingPlanId,
            training_plan_revision: session.source.trainingPlanRevision,
            source_session_key: session.source.sourceSessionKey,
            series_id: null,
            occurrence_key: null,
          }
        : {
            source_kind: session.source.kind,
            direct_operation_id: null,
            training_plan_id: null,
            training_plan_revision: null,
            source_session_key: null,
            series_id: session.source.seriesId,
            occurrence_key: session.source.occurrenceKey,
          };
  const lifecycleValues =
    session.lifecycle.status === "scheduled"
      ? {
          status: session.lifecycle.status,
          cancellation_reason: null,
          cancelled_at: null,
          completed_activity_id: null,
          completion_state: null,
          linked_at: null,
          completion_unlinked_at: null,
        }
      : session.lifecycle.status === "cancelled"
        ? {
            status: session.lifecycle.status,
            cancellation_reason: session.lifecycle.reason,
            cancelled_at: new Date(session.lifecycle.cancelledAt),
            completed_activity_id: null,
            completion_state: null,
            linked_at: null,
            completion_unlinked_at: null,
          }
        : session.lifecycle.completion.state === "linked"
          ? {
              status: session.lifecycle.status,
              cancellation_reason: null,
              cancelled_at: null,
              completed_activity_id: session.lifecycle.completion.activityId,
              completion_state: session.lifecycle.completion.state,
              linked_at: new Date(session.lifecycle.completion.linkedAt),
              completion_unlinked_at: null,
            }
          : {
              status: session.lifecycle.status,
              cancellation_reason: null,
              cancelled_at: null,
              completed_activity_id: null,
              completion_state: session.lifecycle.completion.state,
              linked_at: new Date(session.lifecycle.completion.linkedAt),
              completion_unlinked_at: new Date(session.lifecycle.completion.unlinkedAt),
            };
  return {
    id: session.id,
    profile_id: session.profileId,
    contract_version: session.contractVersion,
    session_revision: session.sessionRevision,
    planning_date: session.planningDate,
    original_target_date: session.originalTargetDate,
    idempotency_key: session.idempotencyKey,
    group_event_id: session.groupEventId ?? null,
    activity_plan_id: session.prescription.activityPlanId,
    activity_plan_revision: session.prescription.activityPlanRevision,
    prescription_structure: session.prescription.structure,
    prescription_quantification: session.prescription.prescriptionQuantification,
    prescription_captured_at: new Date(session.prescription.capturedAt),
    ...sourceValues,
    ...lifecycleValues,
  };
}

function immutableSessionMatches(existing: PlannedSession, replay: PlannedSession): boolean {
  return (
    existing.profileId === replay.profileId &&
    existing.idempotencyKey === replay.idempotencyKey &&
    existing.originalTargetDate === replay.originalTargetDate &&
    JSON.stringify(existing.source) === JSON.stringify(replay.source) &&
    JSON.stringify(existing.prescription) === JSON.stringify(replay.prescription)
  );
}

async function loadOwned(
  db: DrizzleQueryExecutor,
  input: { profileId: string; sessionId: string },
): Promise<PlannedSession | null> {
  const [row] = await db
    .select()
    .from(plannedSessions)
    .where(
      and(eq(plannedSessions.profile_id, input.profileId), eq(plannedSessions.id, input.sessionId)),
    )
    .limit(1);
  return row ? mapPlannedSessionRow(row) : null;
}

async function planExists(
  db: DrizzleQueryExecutor,
  table: typeof trainingPlans | typeof activityPlans,
  input: { profileId: string; planId: string },
): Promise<boolean> {
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(
      and(
        eq(table.id, input.planId),
        or(eq(table.profile_id, input.profileId), eq(table.is_system_template, true)),
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function mutationMiss(
  db: DrizzleQueryExecutor,
  mutation: PlannedSessionMutation,
): Promise<PlannedSessionMutationResult> {
  const current = await loadOwned(db, {
    profileId: mutation.profileId,
    sessionId: mutation.sessionId,
  });
  if (!current) return { status: "not_found" };
  if (current.sessionRevision !== mutation.expectedRevision) {
    return { status: "stale_revision", currentRevision: current.sessionRevision };
  }
  if (mutation.action === "link_completion") {
    const [activity] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(eq(activities.id, mutation.activityId), eq(activities.profile_id, mutation.profileId)),
      )
      .limit(1);
    if (!activity) return { status: "conflict", reason: "activity_not_owned" };
    if (current.lifecycle.status === "completed") {
      return { status: "conflict", reason: "already_completed" };
    }
  }
  if (
    (mutation.action === "move" ||
      mutation.action === "cancel" ||
      mutation.action === "link_completion") &&
    current.lifecycle.status === "completed"
  ) {
    return { status: "conflict", reason: "already_completed" };
  }
  if (mutation.action === "associate_group_event") {
    const [associated] = await db
      .select({ id: plannedSessions.id })
      .from(plannedSessions)
      .where(
        and(
          eq(plannedSessions.profile_id, mutation.profileId),
          eq(plannedSessions.group_event_id, mutation.groupEventId),
        ),
      )
      .limit(1);
    if (associated) return { status: "conflict", reason: "group_event_already_linked" };
  }
  return { status: "not_found" };
}

function isGroupEventUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; constraint?: string; cause?: unknown };
  const cause = candidate.cause as { code?: string; constraint?: string } | undefined;
  return (
    (candidate.code === "23505" || cause?.code === "23505") &&
    (candidate.constraint === "planned_sessions_profile_group_event_unique" ||
      cause?.constraint === "planned_sessions_profile_group_event_unique")
  );
}

export function createDrizzlePlannedSessionRepository(
  db: DrizzleQueryExecutor,
): PlannedSessionRepositoryPort {
  return {
    async createOwned(input): Promise<CreateOwnedPlannedSessionResult> {
      const session = plannedSessionSchema.parse(input.session);
      if (session.profileId !== input.profileId) return { status: "identity_conflict" };
      if (
        !(await planExists(db, activityPlans, {
          profileId: input.profileId,
          planId: session.prescription.activityPlanId,
        }))
      ) {
        return { status: "identity_conflict" };
      }
      if (
        session.source.kind === "training_plan" &&
        !(await planExists(db, trainingPlans, {
          profileId: input.profileId,
          planId: session.source.trainingPlanId,
        }))
      ) {
        return { status: "identity_conflict" };
      }
      let created: PlannedSessionRow | undefined;
      try {
        [created] = await db
          .insert(plannedSessions)
          .values(sessionValues(session))
          .onConflictDoNothing({
            target: [plannedSessions.profile_id, plannedSessions.idempotency_key],
          })
          .returning();
      } catch (error) {
        if (isGroupEventUniqueViolation(error)) {
          return { status: "conflict", reason: "group_event_already_linked" };
        }
        throw error;
      }
      if (created) return { status: "created", session: mapPlannedSessionRow(created) };
      const [existingRow] = await db
        .select()
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, input.profileId),
            eq(plannedSessions.idempotency_key, session.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existingRow) throw new Error("Conflicting planned session could not be loaded");
      const existing = mapPlannedSessionRow(existingRow);
      return immutableSessionMatches(existing, session)
        ? { status: "unchanged", session: existing }
        : { status: "identity_conflict" };
    },

    async listOwnedRange(input) {
      const rows = await db
        .select()
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, input.profileId),
            gte(plannedSessions.planning_date, input.startDate),
            lte(plannedSessions.planning_date, input.endDate),
          ),
        )
        .orderBy(asc(plannedSessions.planning_date), asc(plannedSessions.id))
        .limit(input.limit + 1);
      return {
        items: rows.slice(0, input.limit).map(mapPlannedSessionRow),
        truncated: rows.length > input.limit,
      };
    },

    getOwned(input) {
      return loadOwned(db, input);
    },

    async listOwnedLinkedToActivity(input) {
      const rows = await db
        .select()
        .from(plannedSessions)
        .where(
          and(
            eq(plannedSessions.profile_id, input.profileId),
            eq(plannedSessions.completed_activity_id, input.activityId),
            eq(plannedSessions.status, "completed"),
            eq(plannedSessions.completion_state, "linked"),
          ),
        )
        .orderBy(asc(plannedSessions.id));
      return rows.map(mapPlannedSessionRow);
    },

    async mutateOwned(mutation) {
      const common = and(
        eq(plannedSessions.profile_id, mutation.profileId),
        eq(plannedSessions.id, mutation.sessionId),
        eq(plannedSessions.session_revision, mutation.expectedRevision),
      );
      try {
        const [row] = await db
          .update(plannedSessions)
          .set(
            mutation.action === "move"
              ? {
                  planning_date: mutation.planningDate,
                  session_revision: sql`${plannedSessions.session_revision} + 1`,
                  updated_at: new Date(),
                }
              : mutation.action === "cancel"
                ? {
                    status: "cancelled",
                    cancellation_reason: mutation.reason,
                    cancelled_at: new Date(mutation.cancelledAt),
                    session_revision: sql`${plannedSessions.session_revision} + 1`,
                    updated_at: new Date(mutation.cancelledAt),
                  }
                : mutation.action === "link_completion"
                  ? {
                      status: "completed",
                      completed_activity_id: mutation.activityId,
                      completion_state: "linked",
                      linked_at: new Date(mutation.linkedAt),
                      completion_unlinked_at: null,
                      session_revision: sql`${plannedSessions.session_revision} + 1`,
                      updated_at: new Date(mutation.linkedAt),
                    }
                  : mutation.action === "unlink_deleted_activity"
                    ? {
                        completed_activity_id: null,
                        completion_state: "activity_deleted",
                        completion_unlinked_at: new Date(mutation.unlinkedAt),
                        session_revision: sql`${plannedSessions.session_revision} + 1`,
                        updated_at: new Date(mutation.unlinkedAt),
                      }
                    : mutation.action === "associate_group_event"
                      ? {
                          group_event_id: mutation.groupEventId,
                          session_revision: sql`${plannedSessions.session_revision} + 1`,
                          updated_at: new Date(),
                        }
                      : {
                          group_event_id: null,
                          session_revision: sql`${plannedSessions.session_revision} + 1`,
                          updated_at: new Date(),
                        },
          )
          .where(
            and(
              common,
              mutation.action === "move" ||
                mutation.action === "cancel" ||
                mutation.action === "link_completion" ||
                mutation.action === "associate_group_event"
                ? eq(plannedSessions.status, "scheduled")
                : undefined,
              mutation.action === "link_completion"
                ? sql`exists (select 1 from ${activities} activity where activity.id = ${mutation.activityId}::uuid and activity.profile_id = ${mutation.profileId}::uuid)`
                : undefined,
              mutation.action === "unlink_deleted_activity"
                ? and(
                    eq(plannedSessions.status, "completed"),
                    eq(plannedSessions.completion_state, "linked"),
                    eq(plannedSessions.completed_activity_id, mutation.activityId),
                  )
                : undefined,
              mutation.action === "clear_group_event"
                ? eq(plannedSessions.group_event_id, mutation.groupEventId)
                : undefined,
            ),
          )
          .returning();
        return row
          ? { status: "updated", session: mapPlannedSessionRow(row) }
          : mutationMiss(db, mutation);
      } catch (error) {
        if (mutation.action === "associate_group_event" && isGroupEventUniqueViolation(error)) {
          return { status: "conflict", reason: "group_event_already_linked" };
        }
        throw error;
      }
    },

    trainingPlanExistsForProfile(input) {
      return planExists(db, trainingPlans, {
        profileId: input.profileId,
        planId: input.trainingPlanId,
      });
    },

    activityPlanExistsForProfile(input) {
      return planExists(db, activityPlans, {
        profileId: input.profileId,
        planId: input.activityPlanId,
      });
    },

    async groupEventExistsForProfile(input) {
      const [event] = await db
        .select({ id: groupEvents.id })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.group_id))
        .innerJoin(groupEvents, eq(groupEvents.group_id, groupMemberships.group_id))
        .where(
          and(
            eq(groupMemberships.profile_id, input.profileId),
            eq(groupMemberships.status, "active"),
            eq(groupEvents.id, input.groupEventId),
            isNull(groups.deleted_at),
            isNull(groupEvents.cancelled_at),
          ),
        )
        .limit(1);
      return Boolean(event);
    },
  };
}
