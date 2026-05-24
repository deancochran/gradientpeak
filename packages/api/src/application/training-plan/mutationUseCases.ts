import {
  persistedTrainingPlanStructureSchema,
  type trainingPlanCreateInputSchema,
  trainingPlanSchema,
  type trainingPlanUpdateInputSchema,
} from "@repo/core";
import { schema, type TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import { enqueuePlannedWorkoutSyncAfterCalendarMutation } from "../../lib/provider-sync/planned-workouts";
import type { TrainingPlanRepository } from "../../repositories";

const plannedEventType = "planned_activity" as const;

type TrainingPlanCreateInput = z.infer<typeof trainingPlanCreateInputSchema>;
type TrainingPlanUpdateInput = z.infer<typeof trainingPlanUpdateInputSchema> & {
  id: string;
  template_visibility?: "private" | "public";
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

function withTrainingPlanIdentity<
  T extends {
    id: string;
    profile_id: string | null;
    template_visibility?: string | null;
    is_system_template?: boolean | null;
  },
>(plan: T) {
  return {
    ...plan,
    content_type: "training_plan" as const,
    content_id: plan.id,
    owner_profile_id: plan.profile_id,
    visibility:
      plan.template_visibility === "private" || plan.template_visibility === "public"
        ? plan.template_visibility
        : plan.is_system_template
          ? "public"
          : "private",
  };
}

async function enqueuePlannedWorkoutSyncForCalendarWrite(input: {
  db: DrizzleDbClient;
  eventIds: string[];
  operation: "publish" | "unsync";
  profileId: string;
}) {
  try {
    await enqueuePlannedWorkoutSyncAfterCalendarMutation(input);
  } catch (error) {
    logger.error("Failed to enqueue planned workout sync after calendar write", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function insertTrainingPlan(input: {
  db: DrizzleDbClient;
  values: {
    name: string;
    description: string | null;
    structure: Record<string, unknown>;
    profileId: string;
    templateVisibility?: "private" | "public";
    isPublic?: boolean;
  };
}): Promise<TrainingPlanRow> {
  const result = await input.db.execute(sql<TrainingPlanRow>`
    insert into training_plans (
      name,
      description,
      structure,
      profile_id,
      template_visibility,
      is_public
    )
    values (
      ${input.values.name},
      ${input.values.description},
      ${JSON.stringify(input.values.structure)}::jsonb,
      ${input.values.profileId}::uuid,
      ${input.values.templateVisibility ?? null},
      ${input.values.isPublic ?? null}
    )
    returning *
  `);

  const row = getSqlRows<TrainingPlanRow>(result)[0];
  if (!row) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to save training plan" });
  }
  return row;
}

async function updateOwnedTrainingPlanRow(input: {
  db: DrizzleDbClient;
  id: string;
  profileId: string;
  name?: string;
  description?: string | null;
  structure?: Record<string, unknown>;
  templateVisibility?: "private" | "public";
}): Promise<TrainingPlanRow | null> {
  const updates = [sql`updated_at = now()`];

  if (input.name !== undefined) updates.push(sql`name = ${input.name}`);
  if (input.description !== undefined) updates.push(sql`description = ${input.description}`);
  if (input.structure !== undefined) {
    updates.push(sql`structure = ${JSON.stringify(input.structure)}::jsonb`);
  }
  if (input.templateVisibility !== undefined) {
    updates.push(sql`template_visibility = ${input.templateVisibility}`);
  }

  const result = await input.db.execute(sql<TrainingPlanRow>`
    update training_plans
    set ${sql.join(updates, sql`, `)}
    where id = ${input.id}::uuid
      and profile_id = ${input.profileId}::uuid
    returning *
  `);

  return getSqlRows<TrainingPlanRow>(result)[0] ?? null;
}

export async function createTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
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

  return insertTrainingPlan({
    db: input.db,
    values: {
      name: input.values.name,
      description: input.values.description ?? null,
      structure: structureWithId,
      profileId: input.profileId,
    },
  });
}

export async function updateTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  repository: TrainingPlanRepository;
  values: TrainingPlanUpdateInput;
}) {
  const { id, template_visibility, ...updates } = input.values;
  const structure =
    updates.structure === undefined
      ? undefined
      : parseTrainingPlanStructureOrThrow({
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

  const data = await updateOwnedTrainingPlanRow({
    db: input.db,
    id,
    profileId: input.profileId,
    name: updates.name,
    description: updates.description,
    structure,
    templateVisibility: template_visibility,
  });

  if (!data) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to update training plan" });
  }

  return data;
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

  const removedEvents = await input.db
    .delete(schema.events)
    .where(
      and(
        eq(schema.events.event_type, plannedEventType),
        eq(schema.events.profile_id, input.profileId),
        sql`exists (
          select 1
          from event_schedule_links
          where event_schedule_links.event_id = events.id
            and event_schedule_links.profile_id = ${input.profileId}::uuid
            and event_schedule_links.training_plan_id = ${input.id}::uuid
        )`,
      ),
    )
    .returning({ id: schema.events.id });

  await enqueuePlannedWorkoutSyncForCalendarWrite({
    db: input.db,
    eventIds: removedEvents.map((event) => event.id),
    operation: "unsync",
    profileId: input.profileId,
  });

  await input.db.execute(sql`
    delete from training_plans
    where id = ${input.id}::uuid
      and profile_id = ${input.profileId}::uuid
  `);

  return { success: true };
}

export async function duplicateTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  newName?: string;
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

  try {
    if (sourcePlan.structure) {
      persistedTrainingPlanStructureSchema.parse(sourcePlan.structure);
    }
  } catch (validationError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Source training plan has invalid structure",
      cause: validationError,
    });
  }

  const duplicatedPlanId = crypto.randomUUID();
  const parsedCurrentSourceStructure = trainingPlanSchema.safeParse(sourcePlan.structure);
  const duplicatedStructure = parsedCurrentSourceStructure.success
    ? {
        ...parsedCurrentSourceStructure.data,
        id: duplicatedPlanId,
      }
    : ({ ...(sourcePlan.structure as Record<string, unknown>) } as Record<string, unknown>);

  try {
    persistedTrainingPlanStructureSchema.parse(duplicatedStructure);
  } catch (validationError) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Duplicated training plan structure is invalid",
      cause: validationError,
    });
  }

  const data = await insertTrainingPlan({
    db: input.db,
    values: {
      name: input.newName?.trim() || `${sourcePlan.name} (Copy)`,
      description: sourcePlan.description ?? null,
      structure: duplicatedStructure,
      profileId: input.profileId,
      templateVisibility: "private",
      isPublic: false,
    },
  });

  return withTrainingPlanIdentity(data);
}

export async function applyQuickAdjustmentUseCase(input: {
  adjustedStructure: z.infer<typeof trainingPlanSchema>;
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
      message: "Training plan not found or you don't have permission to edit it",
    });
  }

  const data = await updateOwnedTrainingPlanRow({
    db: input.db,
    id: input.id,
    profileId: input.profileId,
    structure: input.adjustedStructure,
  });

  if (!data) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Failed to adjust training plan" });
  }

  return data;
}

export async function autoAddPeriodizationUseCase(input: {
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
      message: "Training plan not found or you don't have permission to edit it",
    });
  }

  const structure = existing.structure as {
    plan_type?: unknown;
    fitness_progression?: unknown;
  } | null;

  if (structure?.plan_type === "periodized" && structure?.fitness_progression) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This plan already has periodization configured",
    });
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      "Auto-periodization is not yet implemented. Please create a new periodized training plan or manually configure periodization in settings.",
  });
}
