import { type InferredStateSnapshot, inferredStateSnapshotSchema } from "@repo/core";
import type { TrainingPlanInsert, TrainingPlanRow } from "@repo/db";
import { schema } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { type DrizzleQueryExecutor, withRepeatableReadSnapshot } from "../../db";
import type {
  CreateTrainingPlanRecordInput,
  TrainingPlanRepository,
  UpdateTrainingPlanRecordInput,
} from "../../repositories";

function todayStartIsoUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

function isUuidString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export function createTrainingPlanRepository(db: DrizzleDbClient): TrainingPlanRepository {
  const accessibleTo = (executor: DrizzleQueryExecutor, profileId: string) =>
    or(
      eq(schema.trainingPlans.profile_id, profileId),
      eq(schema.trainingPlans.is_system_template, true),
      eq(schema.trainingPlans.content_visibility, "public"),
      and(
        eq(schema.trainingPlans.content_visibility, "followers"),
        exists(
          executor
            .select({ follower_id: schema.follows.follower_id })
            .from(schema.follows)
            .where(
              and(
                eq(schema.follows.follower_id, profileId),
                eq(schema.follows.following_id, schema.trainingPlans.profile_id),
                eq(schema.follows.status, "accepted"),
              ),
            ),
        ),
      ),
      exists(
        executor
          .select({ id: schema.contentAccessGrants.id })
          .from(schema.contentAccessGrants)
          .where(
            and(
              eq(schema.contentAccessGrants.content_type, "training_plan"),
              eq(schema.contentAccessGrants.content_id, schema.trainingPlans.id),
              eq(schema.contentAccessGrants.grantee_profile_id, profileId),
              eq(schema.contentAccessGrants.access_level, "read"),
              isNull(schema.contentAccessGrants.revoked_at),
              or(
                isNull(schema.contentAccessGrants.expires_at),
                gt(schema.contentAccessGrants.expires_at, new Date()),
              ),
            ),
          ),
      ),
    );
  const listConditions = (
    executor: DrizzleQueryExecutor,
    input: {
      ownerScope: "own" | "system" | "public" | "all";
      profileId: string;
      search?: string;
      visibility?: "private" | "followers" | "public";
    },
  ) => {
    const conditions = [];
    if (input.ownerScope === "own")
      conditions.push(eq(schema.trainingPlans.profile_id, input.profileId));
    else if (input.ownerScope === "system")
      conditions.push(eq(schema.trainingPlans.is_system_template, true));
    else if (input.ownerScope === "public")
      conditions.push(eq(schema.trainingPlans.content_visibility, "public"));
    else conditions.push(accessibleTo(executor, input.profileId));
    if (input.visibility)
      conditions.push(eq(schema.trainingPlans.content_visibility, input.visibility));
    if (input.search) {
      const escaped = input.search.replace(/[\\%_]/g, "\\$&");
      conditions.push(
        or(
          ilike(schema.trainingPlans.name, `%${escaped}%`),
          ilike(schema.trainingPlans.description, `%${escaped}%`),
        ),
      );
    }
    return conditions;
  };
  const parseTrainingPlanStructure = (value: unknown): Record<string, unknown> | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  };

  const parsePriorSnapshotFromStructure = (structure: unknown): InferredStateSnapshot | null => {
    const parsedStructure = parseTrainingPlanStructure(structure);
    if (!parsedStructure) {
      return null;
    }

    const metadata = parsedStructure.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      return null;
    }

    const candidate = (metadata as Record<string, unknown>).inferred_state_snapshot;
    const parsedSnapshot = inferredStateSnapshotSchema.safeParse(candidate);
    if (!parsedSnapshot.success) {
      return null;
    }

    return parsedSnapshot.data;
  };

  const resolveTargetPlan = async (input: {
    profileId: string;
    trainingPlanId?: string;
  }): Promise<{
    id: string;
    structure: unknown;
  } | null> => {
    if (input.trainingPlanId) {
      const [data] = await db
        .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
        .from(schema.trainingPlans)
        .where(
          and(
            eq(schema.trainingPlans.id, input.trainingPlanId),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        )
        .limit(1);

      return data ? { id: data.id, structure: data.structure } : null;
    }

    const activeSessions = await db
      .select({
        training_plan_id: schema.plannedSessions.training_plan_id,
        starts_at: schema.plannedSessions.planning_date,
      })
      .from(schema.plannedSessions)

      .where(
        and(
          eq(schema.plannedSessions.profile_id, input.profileId),
          eq(schema.plannedSessions.status, "scheduled"),
          isNotNull(schema.plannedSessions.training_plan_id),
          gte(schema.plannedSessions.planning_date, new Date().toISOString().slice(0, 10)),
        ),
      )
      .orderBy(asc(schema.plannedSessions.planning_date))
      .limit(1);

    const activePlanId = activeSessions[0]?.training_plan_id;
    if (!activePlanId) {
      return null;
    }

    const [activePlan] = await db
      .select({ id: schema.trainingPlans.id, structure: schema.trainingPlans.structure })
      .from(schema.trainingPlans)
      .where(
        and(
          eq(schema.trainingPlans.id, activePlanId),
          eq(schema.trainingPlans.profile_id, input.profileId),
        ),
      )
      .limit(1);

    return activePlan ? { id: activePlan.id, structure: activePlan.structure } : null;
  };

  const getAccessibleTrainingPlan = async (input: {
    id: string;
    profileId: string;
  }): Promise<TrainingPlanRow | null> => {
    const [row] = await db
      .select()
      .from(schema.trainingPlans)
      .where(and(eq(schema.trainingPlans.id, input.id), accessibleTo(db, input.profileId)))
      .limit(1);
    return row ?? null;
  };

  const listPublicTemplateTrainingPlans = async (
    filters?: Parameters<TrainingPlanRepository["listPublicTemplateTrainingPlans"]>[0],
  ): Promise<TrainingPlanRow[]> => {
    const searchPattern = filters?.search?.trim() ? `%${filters.search.trim()}%` : null;
    const durationWeeks = sql`coalesce((${schema.trainingPlans.structure}->'durationWeeks'->>'recommended')::int, 0)`;
    const conditions = [
      eq(schema.trainingPlans.is_system_template, true),
      eq(schema.trainingPlans.content_visibility, "public"),
      filters?.activity_category
        ? sql`exists (
            select 1
            from jsonb_array_elements_text(coalesce(${schema.trainingPlans.structure}->'activity_category', '[]'::jsonb)) as activity_category(value)
            where activity_category.value = ${filters.activity_category}
          )`
        : undefined,
      filters?.experience_level
        ? sql`exists (
            select 1
            from jsonb_array_elements_text(coalesce(${schema.trainingPlans.structure}->'experienceLevel', '[]'::jsonb)) as experience(value)
            where experience.value = ${filters.experience_level}
          )`
        : undefined,
      filters?.min_weeks === undefined ? undefined : sql`${durationWeeks} >= ${filters.min_weeks}`,
      filters?.max_weeks === undefined ? undefined : sql`${durationWeeks} <= ${filters.max_weeks}`,
      filters?.min_sessions_per_week === undefined
        ? undefined
        : sql`coalesce(${schema.trainingPlans.sessions_per_week_target}, 0) >= ${filters.min_sessions_per_week}`,
      filters?.max_sessions_per_week === undefined
        ? undefined
        : sql`coalesce(${schema.trainingPlans.sessions_per_week_target}, 0) <= ${filters.max_sessions_per_week}`,
      searchPattern ? sql`${schema.trainingPlans.name} ilike ${searchPattern}` : undefined,
    ];
    const orderBy =
      filters?.sort_by === "oldest"
        ? [asc(schema.trainingPlans.created_at)]
        : filters?.sort_by === "duration_desc"
          ? [sql`${durationWeeks} desc`, desc(schema.trainingPlans.created_at)]
          : filters?.sort_by === "duration_asc"
            ? [sql`${durationWeeks} asc`, desc(schema.trainingPlans.created_at)]
            : filters?.sort_by === "sessions_desc"
              ? [
                  desc(schema.trainingPlans.sessions_per_week_target),
                  desc(schema.trainingPlans.created_at),
                ]
              : filters?.sort_by === "sessions_asc"
                ? [
                    asc(schema.trainingPlans.sessions_per_week_target),
                    desc(schema.trainingPlans.created_at),
                  ]
                : [desc(schema.trainingPlans.created_at)];

    return db
      .select()
      .from(schema.trainingPlans)
      .where(and(...conditions))
      .orderBy(...orderBy);
  };

  return {
    async countOwnedTrainingPlans(profileId: string): Promise<number> {
      const [result] = await db
        .select({ value: count() })
        .from(schema.trainingPlans)
        .where(eq(schema.trainingPlans.profile_id, profileId));
      return result?.value ?? 0;
    },

    async createTrainingPlan(input: CreateTrainingPlanRecordInput): Promise<TrainingPlanRow> {
      const structure = input.structure as Record<string, unknown>;
      const id =
        typeof structure.id === "string" && isUuidString(structure.id)
          ? structure.id
          : crypto.randomUUID();
      const canonicalStructure = { ...structure, id } as TrainingPlanInsert["structure"];
      const [data] = await db
        .insert(schema.trainingPlans)
        .values({
          id,
          name: input.name,
          description: input.description,
          structure: canonicalStructure,
          structure_hash: activityPlanStructureHash(canonicalStructure),
          profile_id: input.profileId,
          content_visibility: input.contentVisibility,
        })
        .returning();

      if (!data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to create training plan",
        });
      }

      return data;
    },

    async getAccessibleTrainingPlan(input): Promise<TrainingPlanRow | null> {
      return getAccessibleTrainingPlan(input);
    },

    async getActivePlanFromFutureEvents(profileId) {
      const upcomingSessions = await db
        .select({
          training_plan_id: schema.plannedSessions.training_plan_id,
          starts_at: schema.plannedSessions.planning_date,
        })
        .from(schema.plannedSessions)

        .where(
          and(
            eq(schema.plannedSessions.profile_id, profileId),
            eq(schema.plannedSessions.status, "scheduled"),
            isNotNull(schema.plannedSessions.training_plan_id),
            gte(schema.plannedSessions.planning_date, todayStartIsoUtc().slice(0, 10)),
          ),
        )
        .orderBy(asc(schema.plannedSessions.planning_date))
        .limit(50);

      const nextScheduledPlanEvent = upcomingSessions.find(
        (session): session is typeof session & { training_plan_id: string } =>
          isUuidString(session.training_plan_id),
      );

      if (!nextScheduledPlanEvent) {
        return null;
      }

      const trainingPlanId = nextScheduledPlanEvent.training_plan_id;
      const trainingPlan = await getAccessibleTrainingPlan({ id: trainingPlanId, profileId });

      if (!trainingPlan) {
        return null;
      }

      return {
        scheduleBatchId: null,
        trainingPlanId,
        trainingPlan,
        nextEventAt: `${nextScheduledPlanEvent.starts_at}T00:00:00.000Z`,
      };
    },

    async getOwnedTrainingPlan(input): Promise<TrainingPlanRow | null> {
      const [plan] = await db
        .select()
        .from(schema.trainingPlans)
        .where(
          and(
            eq(schema.trainingPlans.id, input.id),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        )
        .limit(1);

      return plan ?? null;
    },

    async getPublicTemplateTrainingPlan(id: string): Promise<TrainingPlanRow | null> {
      const templates = await listPublicTemplateTrainingPlans();
      return templates.find((template) => template.id === id) ?? null;
    },

    async hasTrainingPlanLike(input): Promise<boolean> {
      const rows = await db
        .select({ id: schema.likes.id })
        .from(schema.likes)
        .where(
          and(
            eq(schema.likes.profile_id, input.profileId),
            eq(schema.likes.entity_type, "training_plan"),
            eq(schema.likes.entity_id, input.planId),
          ),
        )
        .limit(1);

      return rows.length > 0;
    },

    async listPublicTemplateTrainingPlans(filters): Promise<TrainingPlanRow[]> {
      return listPublicTemplateTrainingPlans(filters);
    },

    async listTrainingPlanLikedIds(input): Promise<string[]> {
      if (input.planIds.length === 0) {
        return [];
      }

      const rows = await db
        .select({ entity_id: schema.likes.entity_id })
        .from(schema.likes)
        .where(
          and(
            eq(schema.likes.profile_id, input.profileId),
            eq(schema.likes.entity_type, "training_plan"),
            inArray(schema.likes.entity_id, input.planIds),
          ),
        );

      return rows.map((row) => row.entity_id);
    },

    async listTrainingPlans(input): Promise<TrainingPlanRow[]> {
      return db
        .select()
        .from(schema.trainingPlans)
        .where(and(...listConditions(db, input)))
        .orderBy(desc(schema.trainingPlans.created_at));
    },

    async listTrainingPlansPage(input) {
      return withRepeatableReadSnapshot(db, async (tx) => {
        const conditions = listConditions(tx, input);
        const [items, countRows] = await Promise.all([
          tx
            .select()
            .from(schema.trainingPlans)
            .where(and(...conditions))
            .orderBy(desc(schema.trainingPlans.created_at), asc(schema.trainingPlans.id))
            .limit(input.limit)
            .offset(input.offset),
          tx
            .select({ total: count() })
            .from(schema.trainingPlans)
            .where(and(...conditions)),
        ]);
        return { items, total: Number(countRows[0]?.total ?? 0) };
      });
    },

    async updateTrainingPlan(input: UpdateTrainingPlanRecordInput): Promise<TrainingPlanRow> {
      const structure = input.structure as TrainingPlanInsert["structure"];
      const [updatedPlan] = await db
        .update(schema.trainingPlans)
        .set({
          name: input.name,
          description: input.description,
          structure,
          structure_hash: activityPlanStructureHash(structure),
          revision: sql`${schema.trainingPlans.revision} + 1`,
          updated_at: new Date(),
          validated_state_revision: null,
          validated_at: null,
          projection_algorithm_version: null,
        })
        .where(
          and(
            eq(schema.trainingPlans.id, input.id),
            eq(schema.trainingPlans.profile_id, input.profileId),
            eq(schema.trainingPlans.structure_hash, input.expectedStructureHash),
          ),
        )
        .returning();

      if (!updatedPlan) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "STALE_STRUCTURE_HASH",
          cause: {
            code: "STALE_STRUCTURE_HASH",
            expectedStructureHash: input.expectedStructureHash,
          },
        });
      }

      return updatedPlan;
    },

    async getPriorInferredStateSnapshot(profileId: string) {
      const plan = await resolveTargetPlan({ profileId });
      if (!plan) {
        return null;
      }

      return parsePriorSnapshotFromStructure(plan.structure);
    },

    async persistInferredStateSnapshot(input) {
      const plan = await resolveTargetPlan({
        profileId: input.profileId,
        ...(input.trainingPlanId === undefined ? {} : { trainingPlanId: input.trainingPlanId }),
      });

      if (!plan) {
        return;
      }

      const parsedStructure = parseTrainingPlanStructure(plan.structure) ?? {};
      const existingMetadata =
        parsedStructure.metadata &&
        typeof parsedStructure.metadata === "object" &&
        !Array.isArray(parsedStructure.metadata)
          ? (parsedStructure.metadata as Record<string, unknown>)
          : {};

      const nextStructure = {
        ...parsedStructure,
        metadata: {
          ...existingMetadata,
          inferred_state_snapshot: inferredStateSnapshotSchema.parse(input.inferredStateSnapshot),
        },
      };

      await db
        .update(schema.trainingPlans)
        .set({
          structure: nextStructure as TrainingPlanInsert["structure"],
          structure_hash: activityPlanStructureHash(nextStructure),
          revision: sql`${schema.trainingPlans.revision} + 1`,
          validated_state_revision: null,
          validated_at: null,
          projection_algorithm_version: null,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(schema.trainingPlans.id, plan.id),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        );
    },
  };
}
