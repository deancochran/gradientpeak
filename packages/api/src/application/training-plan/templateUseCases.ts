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
