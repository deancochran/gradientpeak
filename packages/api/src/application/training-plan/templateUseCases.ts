import { persistedTrainingPlanStructureSchema, trainingPlanCreateSchema } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import type { TrainingPlanRepository, TrainingPlanTemplateListFilters } from "../../repositories";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import { sanitizeTrainingPlanForViewer } from "./trainingPlanMapping";

type TrainingPlanTemplateListInput = TrainingPlanTemplateListFilters & {
  cursor?: string;
  direction?: "forward" | "backward";
  limit: number;
};

type TrainingPlanTemplateHealthIssueCode =
  | "invalid_persisted_structure"
  | "missing_sport_metadata"
  | "missing_experience_level_metadata"
  | "missing_duration_weeks_metadata";

function auditTrainingPlanTemplateStructureHealth(input: { structure: unknown }): {
  isHealthy: boolean;
  isPersistedCompatible: boolean;
  isCurrentSchemaCompatible: boolean;
  missingMetadata: Array<"sport" | "experienceLevel" | "durationWeeks">;
  issueCodes: TrainingPlanTemplateHealthIssueCode[];
} {
  const structure =
    input.structure && typeof input.structure === "object"
      ? (input.structure as Record<string, unknown>)
      : null;
  const persistedResult = persistedTrainingPlanStructureSchema.safeParse(input.structure);
  const currentResult = structure
    ? trainingPlanCreateSchema.safeParse(
        Object.fromEntries(Object.entries(structure).filter(([key]) => key !== "id")),
      )
    : trainingPlanCreateSchema.safeParse(input.structure);

  const missingMetadata: Array<"sport" | "experienceLevel" | "durationWeeks"> = [];

  if (!Array.isArray(structure?.sport) || structure.sport.length === 0) {
    missingMetadata.push("sport");
  }

  if (!Array.isArray(structure?.experienceLevel) || structure.experienceLevel.length === 0) {
    missingMetadata.push("experienceLevel");
  }

  const durationWeeks =
    structure?.durationWeeks && typeof structure.durationWeeks === "object"
      ? (structure.durationWeeks as Record<string, unknown>)
      : null;

  if (
    typeof durationWeeks?.recommended !== "number" ||
    !Number.isFinite(durationWeeks.recommended)
  ) {
    missingMetadata.push("durationWeeks");
  }

  const issueCodes: TrainingPlanTemplateHealthIssueCode[] = [];

  if (!persistedResult.success) {
    issueCodes.push("invalid_persisted_structure");
  }

  if (missingMetadata.includes("sport")) {
    issueCodes.push("missing_sport_metadata");
  }

  if (missingMetadata.includes("experienceLevel")) {
    issueCodes.push("missing_experience_level_metadata");
  }

  if (missingMetadata.includes("durationWeeks")) {
    issueCodes.push("missing_duration_weeks_metadata");
  }

  return {
    isHealthy: issueCodes.length === 0,
    isPersistedCompatible: persistedResult.success,
    isCurrentSchemaCompatible: currentResult.success,
    missingMetadata,
    issueCodes,
  };
}

function serializeTrainingPlanTemplate(
  template: TrainingPlanRow & { likes_count: number; has_liked: boolean },
) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    sessions_per_week_target: template.sessions_per_week_target,
    duration_hours: template.duration_hours,
    likes_count: template.likes_count,
    has_liked: template.has_liked,
    created_at:
      template.created_at instanceof Date
        ? template.created_at.toISOString()
        : String(template.created_at ?? ""),
    updated_at:
      template.updated_at instanceof Date
        ? template.updated_at.toISOString()
        : String(template.updated_at ?? ""),
    ...(template.structure as object),
  };
}

export async function listTrainingPlanTemplatesUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  query: TrainingPlanTemplateListInput;
  repository: TrainingPlanRepository;
}) {
  const templates = (await input.repository.listPublicTemplateTrainingPlans(input.query)).map(
    (plan) => sanitizeTrainingPlanForViewer(plan, input.profileId),
  );
  const offset = parseIndexCursor(input.query.cursor);
  const pageItems = templates.slice(offset, offset + input.query.limit);
  const pageInfo = buildIndexPageInfo({
    offset,
    limit: input.query.limit,
    total: templates.length,
  });
  const likeStats = await loadLikeStats(input.db, {
    entityType: "training_plan",
    entityIds: pageItems.map((template) => template.id),
    viewerProfileId: input.profileId,
  });

  return {
    items: pageItems.map((template) =>
      serializeTrainingPlanTemplate({
        ...template,
        ...getLikeStats(likeStats, template.id),
      }),
    ),
    total: templates.length,
    ...pageInfo,
  };
}

export async function auditTrainingPlanTemplateHealthUseCase(input: {
  repository: TrainingPlanRepository;
}) {
  const templates = await input.repository.listPublicTemplateTrainingPlans();
  const items = templates.map((template) => {
    const health = auditTrainingPlanTemplateStructureHealth({ structure: template.structure });

    return {
      id: template.id,
      name: template.name,
      ...health,
    };
  });

  return {
    total: items.length,
    healthy_count: items.filter((item) => item.isHealthy).length,
    legacy_count: items.filter(
      (item) => item.isPersistedCompatible && !item.isCurrentSchemaCompatible,
    ).length,
    invalid_count: items.filter((item) => !item.isPersistedCompatible).length,
    metadata_gap_count: items.filter((item) => item.missingMetadata.length > 0).length,
    items,
  };
}

export async function getTrainingPlanTemplateUseCase(input: {
  id: string;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const foundTemplate = await input.repository.getPublicTemplateTrainingPlan(input.id);

  if (!foundTemplate) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Template not found",
    });
  }
  const template = sanitizeTrainingPlanForViewer(foundTemplate, input.profileId);

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    sessions_per_week_target: template.sessions_per_week_target,
    duration_hours: template.duration_hours,
    ...(template.structure as object),
  };
}
