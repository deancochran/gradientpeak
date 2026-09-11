import {
  ActivityPlanVariantResolutionError,
  activityPlanDocumentSchema,
  canonicalTrainingPlanStructureSchema,
  normalizeActivityTemplateStructureForAudit,
  resolveActivityPlanVariant,
  SYSTEM_TEMPLATES,
  type trainingPlanCreateInputSchema,
  trainingPlanCreateSchema,
  trainingPlanSchema,
  type trainingPlanUpdateInputSchema,
} from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type {
  LockedPlanningTemplateRow,
  PlanningTemplateRepository,
  TrainingPlanRepository,
  TrainingPlanTransactionClient,
} from "../../repositories";
import {
  activityPlanDocumentHash,
  activityPlanStructureHash,
} from "../activity-plans/structure-hash";
import { mapTrainingPlanContentIdentity } from "./trainingPlanMapping";

type TrainingPlanCreateInput = z.infer<typeof trainingPlanCreateInputSchema>;
type TrainingPlanUpdateInput = z.infer<typeof trainingPlanUpdateInputSchema> & {
  id: string;
  expectedStructureHash: string;
  content_visibility?: "private" | "followers" | "public";
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

export function materializeTrainingPlanActivityPlanVariants(input: {
  rows: LockedPlanningTemplateRow[];
  structure: z.infer<typeof trainingPlanCreateSchema> & { id?: string };
}): z.infer<typeof trainingPlanSchema> | z.infer<typeof canonicalTrainingPlanStructureSchema> {
  const activityPlanIds = Array.from(
    new Set(input.structure.sessions.map((session) => session.activity_plan_id)),
  );
  const catalogSignatures = new Map(
    SYSTEM_TEMPLATES.map(
      (source) =>
        [
          source.id,
          JSON.stringify(normalizeActivityTemplateStructureForAudit(source.structure)),
        ] as const,
    ),
  );
  const publishedIds = new Set(
    input.rows
      .filter((row) => {
        const parsed = activityPlanDocumentSchema.safeParse(row.structure);
        if (
          !parsed.success ||
          typeof row.gpsRecordingEnabled !== "boolean" ||
          activityPlanDocumentHash(parsed.data) !== row.structureHash
        ) {
          return false;
        }
        if (!row.isSystemTemplate) return true;
        const expectedSignature = catalogSignatures.get(row.id);
        const resolved = resolveActivityPlanVariant(parsed.data);
        return (
          expectedSignature !== undefined &&
          resolved.variantId === row.id &&
          resolved.variantName === "Base" &&
          JSON.stringify(normalizeActivityTemplateStructureForAudit(resolved.structure)) ===
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

  const rowById = new Map(input.rows.map((row) => [row.id, row]));
  const sessions = input.structure.sessions.map((session) => {
    const row = rowById.get(session.activity_plan_id);
    if (!row) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Training plan contains an unavailable activity plan: ${session.activity_plan_id}`,
      });
    }
    const document = activityPlanDocumentSchema.parse(row.structure);
    try {
      const resolved = resolveActivityPlanVariant(
        document,
        session.activity_plan_variant_id === undefined
          ? undefined
          : { variantId: session.activity_plan_variant_id },
      );
      return { ...session, activity_plan_variant_id: resolved.variantId };
    } catch (error) {
      if (!(error instanceof ActivityPlanVariantResolutionError)) throw error;
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Training plan contains an unknown activity-plan variant: ${error.variantId}`,
        cause: error,
      });
    }
  });
  const materialized = { ...input.structure, sessions };
  return "id" in materialized && materialized.id !== undefined
    ? trainingPlanSchema.parse(materialized)
    : canonicalTrainingPlanStructureSchema.parse(materialized);
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
  const parsedStructure = parseTrainingPlanCreateStructureOrThrow({
    value: input.values.structure,
    message: "Invalid training plan structure",
  });
  const defaultContentVisibility = await getProfileDefaultContentVisibility(
    input.db,
    input.profileId,
  );
  const templateIds = parsedStructure.sessions.map((session) => session.activity_plan_id);
  return input.planningTemplateRepository.withLockedPublishedTemplates(
    input.profileId,
    templateIds,
    async ({ db, rows }) => {
      const materializedStructure = materializeTrainingPlanActivityPlanVariants({
        rows,
        structure: { ...parsedStructure, id: planId },
      });
      return insertTrainingPlan({
        db,
        values: {
          name: input.values.name,
          description: input.values.description ?? null,
          structure: materializedStructure,
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

  const structure = submittedStructure ? { ...submittedStructure, id } : undefined;
  const effectiveStructure =
    structure ??
    parseTrainingPlanStructureOrThrow({
      value: existing.structure,
      message: "Existing training plan structure is invalid",
    });
  const templateIds = effectiveStructure.sessions.map((session) => session.activity_plan_id);
  const data = await input.planningTemplateRepository.withLockedPublishedTemplates(
    input.profileId,
    templateIds,
    async ({ db, rows }) => {
      const materializedStructure = materializeTrainingPlanActivityPlanVariants({
        rows,
        structure: effectiveStructure,
      });
      return updateOwnedTrainingPlanRow({
        db,
        id,
        profileId: input.profileId,
        name: updates.name,
        description: updates.description,
        expectedStructureHash,
        structure: structure === undefined ? undefined : materializedStructure,
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
    input.profileId,
    duplicatedStructure.sessions.map((session) => session.activity_plan_id),
    async ({ db, rows }) => {
      const materializedStructure = materializeTrainingPlanActivityPlanVariants({
        rows,
        structure: duplicatedStructure,
      });
      return insertTrainingPlan({
        db,
        values: {
          name: input.newName?.trim() || `${sourcePlan.name} (Copy)`,
          description: sourcePlan.description ?? null,
          structure: materializedStructure,
          profileId: input.profileId,
          contentVisibility: "private",
        },
      });
    },
  );

  return mapTrainingPlanContentIdentity(data);
}
