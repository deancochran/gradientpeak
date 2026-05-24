import { type InferredStateSnapshot, inferredStateSnapshotSchema } from "@repo/core";
import type { TrainingPlanInsert, TrainingPlanRow } from "@repo/db";
import { schema } from "@repo/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type {
  CreateTrainingPlanRecordInput,
  TrainingPlanRepository,
  UpdateTrainingPlanRecordInput,
} from "../../repositories";

type DrizzleLike = {
  execute: any;
  insert: any;
  select: any;
  update: any;
};

type TrainingPlanCountRow = { value: number | string };
type UpcomingTrainingPlanEvent = {
  schedule_batch_id: string | null;
  starts_at: Date;
  training_plan_id: string | null;
  user_training_plan_id: string | null;
};

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

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

export function createTrainingPlanRepository(db: DrizzleLike): TrainingPlanRepository {
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

    const activeEvents = await db
      .select({
        training_plan_id: schema.eventScheduleLinks.training_plan_id,
        starts_at: schema.events.starts_at,
      })
      .from(schema.events)
      .innerJoin(
        schema.eventScheduleLinks,
        eq(schema.eventScheduleLinks.event_id, schema.events.id),
      )
      .where(
        and(
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.event_type, "planned_activity"),
          isNotNull(schema.eventScheduleLinks.training_plan_id),
          gte(schema.events.starts_at, new Date()),
        ),
      )
      .orderBy(asc(schema.events.starts_at))
      .limit(1);

    const activePlanId = activeEvents[0]?.training_plan_id;
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
    const result = await db.execute(sql<TrainingPlanRow>`
      select *
      from training_plans
      where id = ${input.id}::uuid
        and (
          profile_id = ${input.profileId}::uuid
          or is_system_template = true
          or template_visibility = 'public'
          or exists (
            select 1
            from content_access_grants
            where content_access_grants.content_type = 'training_plan'
              and content_access_grants.content_id = training_plans.id
              and content_access_grants.grantee_profile_id = ${input.profileId}::uuid
              and content_access_grants.access_level = 'read'
              and content_access_grants.revoked_at is null
              and (content_access_grants.expires_at is null or content_access_grants.expires_at > now())
          )
        )
      limit 1
    `);

    return getSqlRows<TrainingPlanRow>(result)[0] ?? null;
  };

  const listPublicTemplateTrainingPlans = async (
    filters?: Parameters<TrainingPlanRepository["listPublicTemplateTrainingPlans"]>[0],
  ): Promise<TrainingPlanRow[]> => {
    const searchPattern = filters?.search?.trim() ? `%${filters.search.trim()}%` : null;
    const sortClause =
      filters?.sort_by === "oldest"
        ? sql`created_at asc`
        : filters?.sort_by === "duration_desc"
          ? sql`coalesce((training_plans.structure->'durationWeeks'->>'recommended')::int, 0) desc, created_at desc`
          : filters?.sort_by === "duration_asc"
            ? sql`coalesce((training_plans.structure->'durationWeeks'->>'recommended')::int, 0) asc, created_at desc`
            : filters?.sort_by === "sessions_desc"
              ? sql`sessions_per_week_target desc nulls last, created_at desc`
              : filters?.sort_by === "sessions_asc"
                ? sql`sessions_per_week_target asc nulls last, created_at desc`
                : sql`created_at desc`;

    const result = await db.execute(sql<TrainingPlanRow>`
      select
        id,
        name,
        description,
        structure,
        sessions_per_week_target,
        duration_hours,
        is_system_template,
        template_visibility,
        likes_count,
        created_at,
        updated_at,
        profile_id
      from training_plans
      where is_system_template = true
        and template_visibility = 'public'
        and (
          ${filters?.sport ?? null}::text is null
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(training_plans.structure->'sport', '[]'::jsonb)) as sport(value)
            where sport.value = ${filters?.sport ?? null}
          )
        )
        and (
          ${filters?.experience_level ?? null}::text is null
          or exists (
            select 1
            from jsonb_array_elements_text(coalesce(training_plans.structure->'experienceLevel', '[]'::jsonb)) as experience(value)
            where experience.value = ${filters?.experience_level ?? null}
          )
        )
        and (
          ${filters?.min_weeks ?? null}::int is null
          or coalesce((training_plans.structure->'durationWeeks'->>'recommended')::int, 0) >= ${filters?.min_weeks ?? null}
        )
        and (
          ${filters?.max_weeks ?? null}::int is null
          or coalesce((training_plans.structure->'durationWeeks'->>'recommended')::int, 0) <= ${filters?.max_weeks ?? null}
        )
        and (
          ${filters?.min_sessions_per_week ?? null}::int is null
          or coalesce(training_plans.sessions_per_week_target, 0) >= ${filters?.min_sessions_per_week ?? null}
        )
        and (
          ${filters?.max_sessions_per_week ?? null}::int is null
          or coalesce(training_plans.sessions_per_week_target, 0) <= ${filters?.max_sessions_per_week ?? null}
        )
        and (
          ${searchPattern}::text is null
          or training_plans.name ilike ${searchPattern}
        )
      order by ${sortClause}
    `);

    return getSqlRows<TrainingPlanRow>(result);
  };

  return {
    async countOwnedTrainingPlans(profileId: string): Promise<number> {
      const result = await db.execute(sql<TrainingPlanCountRow>`
        select count(*)::int as value
        from training_plans
        where profile_id = ${profileId}::uuid
      `);

      return Number(getSqlRows<TrainingPlanCountRow>(result)[0]?.value ?? 0);
    },

    async createTrainingPlan(input: CreateTrainingPlanRecordInput): Promise<TrainingPlanRow> {
      const [data] = await db
        .insert(schema.trainingPlans)
        .values({
          name: input.name,
          description: input.description,
          structure: input.structure as TrainingPlanInsert["structure"],
          profile_id: input.profileId,
        })
        .returning();

      if (!data) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to create training plan",
        });
      }

      return data as TrainingPlanRow;
    },

    async getAccessibleTrainingPlan(input): Promise<TrainingPlanRow | null> {
      return getAccessibleTrainingPlan(input);
    },

    async getActivePlanFromFutureEvents(profileId) {
      const upcomingEvents = await db
        .select({
          training_plan_id: schema.eventScheduleLinks.training_plan_id,
          schedule_batch_id: schema.eventScheduleLinks.schedule_batch_id,
          user_training_plan_id: schema.eventScheduleLinks.user_training_plan_id,
          starts_at: schema.events.starts_at,
        })
        .from(schema.events)
        .innerJoin(
          schema.eventScheduleLinks,
          eq(schema.eventScheduleLinks.event_id, schema.events.id),
        )
        .where(
          and(
            eq(schema.events.profile_id, profileId),
            eq(schema.events.event_type, "planned_activity"),
            isNotNull(schema.eventScheduleLinks.training_plan_id),
            gte(schema.events.starts_at, new Date(todayStartIsoUtc())),
          ),
        )
        .orderBy(asc(schema.events.starts_at))
        .limit(50);

      const nextScheduledPlanEvent = (upcomingEvents as UpcomingTrainingPlanEvent[]).find(
        (event) => isUuidString(event.training_plan_id) && event.starts_at instanceof Date,
      );

      if (!nextScheduledPlanEvent) {
        return null;
      }

      const trainingPlanId = nextScheduledPlanEvent.training_plan_id as string;
      const trainingPlan = await getAccessibleTrainingPlan({ id: trainingPlanId, profileId });

      if (!trainingPlan) {
        return null;
      }

      return {
        scheduleBatchId: nextScheduledPlanEvent.schedule_batch_id ?? null,
        trainingPlanId,
        userTrainingPlanId: nextScheduledPlanEvent.user_training_plan_id ?? null,
        trainingPlan,
        nextEventAt: nextScheduledPlanEvent.starts_at.toISOString(),
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

      return (plan as TrainingPlanRow | undefined) ?? null;
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

      return rows.map((row: { entity_id: string }) => row.entity_id);
    },

    async listTrainingPlans(input): Promise<TrainingPlanRow[]> {
      const conditions = [sql`1 = 1`];

      if (input.ownerScope === "own") {
        conditions.push(sql`profile_id = ${input.profileId}::uuid`);
      } else if (input.ownerScope === "system") {
        conditions.push(sql`is_system_template = true`);
      } else if (input.ownerScope === "public") {
        conditions.push(sql`template_visibility = 'public'`);
      } else {
        conditions.push(sql`(
          profile_id = ${input.profileId}::uuid
          or is_system_template = true
          or template_visibility = 'public'
          or exists (
            select 1
            from content_access_grants
            where content_access_grants.content_type = 'training_plan'
              and content_access_grants.content_id = training_plans.id
              and content_access_grants.grantee_profile_id = ${input.profileId}::uuid
              and content_access_grants.access_level = 'read'
              and content_access_grants.revoked_at is null
              and (content_access_grants.expires_at is null or content_access_grants.expires_at > now())
          )
        )`);
      }

      if (input.visibility) {
        conditions.push(sql`template_visibility = ${input.visibility}`);
      }

      const result = await db.execute(sql<TrainingPlanRow>`
        select *
        from training_plans
        where ${sql.join(conditions, sql` and `)}
        order by created_at desc
      `);

      return getSqlRows<TrainingPlanRow>(result);
    },

    async updateTrainingPlan(input: UpdateTrainingPlanRecordInput): Promise<TrainingPlanRow> {
      const [updatedPlan] = await db
        .update(schema.trainingPlans)
        .set({
          name: input.name,
          description: input.description,
          structure: input.structure as TrainingPlanInsert["structure"],
        })
        .where(
          and(
            eq(schema.trainingPlans.id, input.id),
            eq(schema.trainingPlans.profile_id, input.profileId),
          ),
        )
        .returning();

      if (!updatedPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Failed to update training plan",
        });
      }

      return updatedPlan as TrainingPlanRow;
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
        trainingPlanId: input.trainingPlanId,
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
