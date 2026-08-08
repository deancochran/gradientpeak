import {
  activityPlanStructureSchema,
  buildSystemActivityTemplateCatalog,
  normalizeActivityTemplateStructureForAudit,
  SYSTEM_TEMPLATES,
  type trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
  type trainingPlanUpdateInputSchema,
} from "@repo/core";
import { schema, type TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import { enqueueWahooPlannedActivitySyncAfterCalendarMutation } from "../../lib/provider-sync/planned-activities";
import type {
  LockedPlanningTemplateRow,
  PlanningTemplateRepository,
  TrainingPlanRepository,
  TrainingPlanTransactionClient,
} from "../../repositories";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { mapTrainingPlanContentIdentity } from "./trainingPlanMapping";

const plannedEventType = "planned" as const;

type TrainingPlanCreateInput = z.infer<typeof trainingPlanCreateInputSchema>;
type TrainingPlanUpdateInput = z.infer<typeof trainingPlanUpdateInputSchema> & {
  id: string;
  expectedStructureHash: string;
  content_visibility?: "private" | "followers" | "public";
};

export type TrainingPlanActivityDateChange = {
  event_id: string;
  expected_scheduled_date: string;
  requested_scheduled_date: string;
};

function getSqlRows<T>(result: unknown) {
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function parseTrainingPlanStructureOrThrow(input: {
  value: unknown;
  message: string;
}): z.infer<typeof trainingPlanSchema> {
  const parsed = trainingPlanSchema.safeParse(input.value);
  if (parsed.success) {
    return parsed.data;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: input.message,
    cause: parsed.error,
  });
}

function parseTrainingPlanCreateStructureOrThrow(input: {
  value: unknown;
  message: string;
}): z.infer<typeof trainingPlanCreateSchema> {
  const parsed = trainingPlanCreateSchema.safeParse(input.value);
  if (parsed.success) return parsed.data;

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: input.message,
    cause: parsed.error,
  });
}

export function requirePublishedLinkedActivityPlans(input: {
  rows: LockedPlanningTemplateRow[];
  structure: z.infer<typeof trainingPlanSchema>;
}) {
  const activityPlanIds = Array.from(
    new Set(input.structure.sessions.map((session) => session.activity_plan_id)),
  );
  const catalogSignatures = new Map(
    buildSystemActivityTemplateCatalog().flatMap((candidate) => {
      const source = SYSTEM_TEMPLATES.find((template) => template.id === candidate.template_id);
      const parsed = activityPlanStructureSchema.safeParse(source?.structure);
      return parsed.success
        ? [
            [
              candidate.template_id,
              JSON.stringify(normalizeActivityTemplateStructureForAudit(parsed.data)),
            ] as const,
          ]
        : [];
    }),
  );
  const publishedIds = new Set(
    input.rows
      .filter((row) => {
        const parsed = activityPlanStructureSchema.safeParse(row.structure);
        if (
          !parsed.success ||
          typeof row.gpsRecordingEnabled !== "boolean" ||
          activityPlanStructureHash(parsed.data) !== row.structureHash
        ) {
          return false;
        }
        if (!row.isSystemTemplate) return true;
        const expectedSignature = catalogSignatures.get(row.id);
        return (
          expectedSignature !== undefined &&
          JSON.stringify(normalizeActivityTemplateStructureForAudit(parsed.data)) ===
            expectedSignature
        );
      })
      .map((row) => row.id),
  );
  const rejectedIds = activityPlanIds.filter((id) => !publishedIds.has(id));

  if (rejectedIds.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Training plan contains missing, inaccessible, or unpublished activity plans: ${rejectedIds.join(", ")}`,
    });
  }
}

async function enqueuePlannedActivitySyncForCalendarWrite(input: {
  db: DrizzleDbClient;
  eventIds: string[];
  operation: "publish" | "unsync";
  profileId: string;
}) {
  try {
    await enqueueWahooPlannedActivitySyncAfterCalendarMutation(input);
  } catch (error) {
    logger.error("Failed to enqueue planned activity sync after calendar write", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function insertTrainingPlan(input: {
  db: TrainingPlanTransactionClient;
  values: {
    name: string;
    description: string | null;
    structure: Record<string, unknown>;
    profileId: string;
    contentVisibility?: "private" | "followers" | "public";
  };
}): Promise<TrainingPlanRow> {
  const result = await input.db.execute(sql<TrainingPlanRow>`
    insert into training_plans (
      id,
      name,
      description,
      structure,
      structure_hash,
      profile_id,
      content_visibility
    )
    values (
      ${(input.values.structure as { id: string }).id}::uuid,
      ${input.values.name},
      ${input.values.description},
      ${JSON.stringify(input.values.structure)}::jsonb,
      ${activityPlanStructureHash(input.values.structure)},
      ${input.values.profileId}::uuid,
      ${input.values.contentVisibility ?? "private"}
    )
    returning *
  `);

  const row = getSqlRows<TrainingPlanRow>(result)[0];
  if (!row) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to save training plan" });
  }

  return row;
}

async function getProfileDefaultContentVisibility(db: DrizzleDbClient, profileId: string) {
  const result = await db.execute(sql<{
    default_content_visibility: "private" | "followers" | "public";
  }>`
    select default_content_visibility
    from profiles
    where id = ${profileId}::uuid
    limit 1
  `);
  return (
    getSqlRows<{ default_content_visibility: "private" | "followers" | "public" }>(result)[0]
      ?.default_content_visibility ?? "private"
  );
}

async function updateOwnedTrainingPlanRow(input: {
  db: TrainingPlanTransactionClient;
  id: string;
  profileId: string;
  name?: string;
  description?: string | null;
  structure?: Record<string, unknown>;
  expectedStructureHash: string;
  contentVisibility?: "private" | "followers" | "public";
}): Promise<TrainingPlanRow | null> {
  const updates = [sql`updated_at = now()`, sql`revision = revision + 1`];

  if (input.name !== undefined) updates.push(sql`name = ${input.name}`);
  if (input.description !== undefined) updates.push(sql`description = ${input.description}`);
  if (input.structure !== undefined) {
    updates.push(sql`structure = ${JSON.stringify(input.structure)}::jsonb`);
    updates.push(sql`structure_hash = ${activityPlanStructureHash(input.structure)}`);
    updates.push(sql`validated_state_revision = null`);
    updates.push(sql`validated_at = null`);
    updates.push(sql`projection_algorithm_version = null`);
  }
  if (input.contentVisibility !== undefined) {
    updates.push(sql`content_visibility = ${input.contentVisibility}`);
  }

  const result = await input.db.execute(sql<TrainingPlanRow>`
    update training_plans
    set ${sql.join(updates, sql`, `)}
    where id = ${input.id}::uuid
      and profile_id = ${input.profileId}::uuid
      and structure_hash = ${input.expectedStructureHash}
    returning *
  `);

  return getSqlRows<TrainingPlanRow>(result)[0] ?? null;
}

export async function createTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  planningTemplateRepository: PlanningTemplateRepository;
  profileId: string;
  values: TrainingPlanCreateInput;
}) {
  const planId = crypto.randomUUID();
  const structureWithId = {
    ...input.values.structure,
    id: planId,
  };

  try {
    trainingPlanSchema.parse(structureWithId);
  } catch (validationError) {
    logger.error("Training plan validation error", {
      error:
        validationError instanceof Error ? validationError.message : "Unknown validation error",
    });

    let errorMessage = "Invalid training plan structure";
    const errorDetails: string[] = [];

    if (validationError && typeof validationError === "object") {
      const zodError = validationError as {
        errors?: Array<{ path?: string[]; message?: string }>;
        message?: string;
      };
      if (Array.isArray(zodError.errors)) {
        for (const err of zodError.errors) {
          const path = err.path ? err.path.join(".") : "unknown";
          const message = err.message || "validation failed";
          errorDetails.push(`${path}: ${message}`);
        }

        if (errorDetails.length > 0) {
          errorMessage = `Training plan validation failed:\n${errorDetails.join("\n")}`;
        }
      } else if (zodError.message) {
        errorMessage = zodError.message;
      }
    }

    throw new TRPCError({
      code: "BAD_REQUEST",
      message: errorMessage,
      cause: validationError,
    });
  }

  const parsedStructure = parseTrainingPlanStructureOrThrow({
    value: structureWithId,
    message: "Invalid training plan structure",
  });
  const defaultContentVisibility = await getProfileDefaultContentVisibility(
    input.db,
    input.profileId,
  );
  const templateIds = parsedStructure.sessions.map((session) => session.activity_plan_id);
  return input.planningTemplateRepository.withLockedPublishedTemplates(
    templateIds,
    async ({ db, rows }) => {
      requirePublishedLinkedActivityPlans({ rows, structure: parsedStructure });
      return insertTrainingPlan({
        db,
        values: {
          name: input.values.name,
          description: input.values.description ?? null,
          structure: structureWithId,
          profileId: input.profileId,
          contentVisibility: input.values.content_visibility ?? defaultContentVisibility,
        },
      });
    },
  );
}

export async function updateTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  planningTemplateRepository: PlanningTemplateRepository;
  profileId: string;
  repository: TrainingPlanRepository;
  values: TrainingPlanUpdateInput;
}) {
  const { id, expectedStructureHash, content_visibility, ...updates } = input.values;
  const submittedStructure =
    updates.structure === undefined
      ? undefined
      : parseTrainingPlanCreateStructureOrThrow({
          value: updates.structure,
          message: "Invalid training plan structure",
        });

  const existing = await input.repository.getOwnedTrainingPlan({ id, profileId: input.profileId });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Training plan not found or you don't have permission to edit it",
    });
  }
  if (existing.structure_hash !== expectedStructureHash) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "STALE_STRUCTURE_HASH",
      cause: {
        code: "STALE_STRUCTURE_HASH",
        expectedStructureHash,
        currentStructureHash: existing.structure_hash,
      },
    });
  }

  const structure = submittedStructure
    ? trainingPlanSchema.parse({ ...submittedStructure, id })
    : undefined;
  const effectiveStructure =
    structure ??
    parseTrainingPlanStructureOrThrow({
      value: existing.structure,
      message: "Existing training plan structure is invalid",
    });
  const templateIds = effectiveStructure.sessions.map((session) => session.activity_plan_id);
  const data = await input.planningTemplateRepository.withLockedPublishedTemplates(
    templateIds,
    async ({ db, rows }) => {
      requirePublishedLinkedActivityPlans({ rows, structure: effectiveStructure });
      return updateOwnedTrainingPlanRow({
        db,
        id,
        profileId: input.profileId,
        name: updates.name,
        description: updates.description,
        expectedStructureHash,
        structure,
        contentVisibility: content_visibility,
      });
    },
  );

  if (!data) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "STALE_STRUCTURE_HASH",
      cause: { code: "STALE_STRUCTURE_HASH", expectedStructureHash },
    });
  }

  return data;
}

export async function reorderTrainingPlanActivitiesUseCase(input: {
  changes: TrainingPlanActivityDateChange[];
  db: DrizzleDbClient;
  profileId: string;
  trainingPlanId: string;
}) {
  const updatedEventIds = await input.db.transaction(async (tx) => {
    const ownedPlan = await tx.execute(sql<{ id: string }>`
      select id
      from training_plans
      where id = ${input.trainingPlanId}::uuid
        and profile_id = ${input.profileId}::uuid
        and is_system_template = false
      for update
    `);

    if (getSqlRows<{ id: string }>(ownedPlan).length !== 1) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Training plan not found or you don't have permission to reorder it",
      });
    }

    const updateResult = await tx.execute(sql<{ id: string }>`
      with requested_changes as (
        select *
        from jsonb_to_recordset(${JSON.stringify(input.changes)}::jsonb) as change(
          event_id uuid,
          expected_scheduled_date text,
          requested_scheduled_date text
        )
      )
      update events as event
      set
        scheduled_date = change.requested_scheduled_date,
        starts_at = event.starts_at
          + ((change.requested_scheduled_date::date - change.expected_scheduled_date::date) * interval '1 day'),
        ends_at = case
          when event.ends_at is null then null
          else event.ends_at
            + ((change.requested_scheduled_date::date - change.expected_scheduled_date::date) * interval '1 day')
        end,
        updated_at = now()
      from requested_changes as change
      where event.id = change.event_id
        and event.profile_id = ${input.profileId}::uuid
        and event.training_plan_id = ${input.trainingPlanId}::uuid
        and event.event_type = 'planned'
        and event.activity_plan_id is not null
        and event.status <> 'completed'
        and event.linked_activity_id is null
        and event.read_only is not true
        and event.scheduled_date = change.expected_scheduled_date
      returning event.id
    `);
    const updatedRows = getSqlRows<{ id: string }>(updateResult);

    if (updatedRows.length !== input.changes.length) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Scheduled activities changed or are no longer eligible; reload and try again",
      });
    }
    await tx.execute(sql`
      update training_plans
      set revision = revision + 1,
          validated_state_revision = null,
          validated_at = null,
          projection_algorithm_version = null,
          updated_at = now()
      where id = ${input.trainingPlanId}::uuid
        and profile_id = ${input.profileId}::uuid
    `);

    return updatedRows.map((row) => row.id);
  });

  await enqueuePlannedActivitySyncForCalendarWrite({
    db: input.db,
    eventIds: updatedEventIds,
    operation: "publish",
    profileId: input.profileId,
  });

  return {
    affected_count: updatedEventIds.length,
    affected_event_ids: updatedEventIds,
  };
}

export async function deleteTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const existing = await input.repository.getOwnedTrainingPlan({
    id: input.id,
    profileId: input.profileId,
  });

  if (!existing) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Training plan not found or you don't have permission to delete it",
    });
  }

  await input.db.transaction(async (tx) => {
    const plannedEvents = await tx
      .select({ id: schema.events.id })
      .from(schema.events)
      .where(
        and(
          eq(schema.events.event_type, plannedEventType),
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.training_plan_id, input.id),
        ),
      )
      .for("update");
    const syncResult = await enqueueWahooPlannedActivitySyncAfterCalendarMutation({
      db: input.db,
      eventIds: plannedEvents.map((event) => event.id),
      operation: "unsync",
      profileId: input.profileId,
      transaction: tx,
    });
    if (syncResult && !syncResult.success) {
      throw new Error(syncResult.error ?? "Failed to enqueue planned activity cleanup");
    }

    await tx
      .delete(schema.events)
      .where(
        and(
          eq(schema.events.event_type, plannedEventType),
          eq(schema.events.profile_id, input.profileId),
          eq(schema.events.training_plan_id, input.id),
        ),
      );
    await tx.execute(sql`
      delete from training_plans
      where id = ${input.id}::uuid
        and profile_id = ${input.profileId}::uuid
    `);
  });

  return { success: true };
}

export async function duplicateTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  newName?: string;
  planningTemplateRepository: PlanningTemplateRepository;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const sourcePlan = await input.repository.getAccessibleTrainingPlan({
    id: input.id,
    profileId: input.profileId,
  });

  if (!sourcePlan) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Training plan not found" });
  }

  const parsedSourceStructure = trainingPlanSchema.safeParse(sourcePlan.structure);
  if (!parsedSourceStructure.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Source training plan has invalid structure",
      cause: parsedSourceStructure.error,
    });
  }

  const duplicatedPlanId = crypto.randomUUID();
  const duplicatedStructure = trainingPlanSchema.parse({
    ...parsedSourceStructure.data,
    id: duplicatedPlanId,
  });

  const data = await input.planningTemplateRepository.withLockedPublishedTemplates(
    duplicatedStructure.sessions.map((session) => session.activity_plan_id),
    async ({ db, rows }) => {
      requirePublishedLinkedActivityPlans({ rows, structure: duplicatedStructure });
      return insertTrainingPlan({
        db,
        values: {
          name: input.newName?.trim() || `${sourcePlan.name} (Copy)`,
          description: sourcePlan.description ?? null,
          structure: duplicatedStructure,
          profileId: input.profileId,
          contentVisibility: "private",
        },
      });
    },
  );

  return mapTrainingPlanContentIdentity(data);
}
