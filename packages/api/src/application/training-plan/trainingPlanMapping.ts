import { persistedTrainingPlanStructureSchema } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import type { TrainingPlanRepository } from "../../repositories";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { loadProfileIdentityMap, type profileIdentitySchema } from "../../utils/profile-identity";

type TrainingPlanWithIdentityFields = {
  id: string;
  is_system_template?: boolean | null;
  profile_id: string | null;
  template_visibility?: string | null;
};

type ProfileIdentityMap = Map<string, z.infer<typeof profileIdentitySchema>>;

export function mapTrainingPlanContentIdentity<T extends TrainingPlanWithIdentityFields>(plan: T) {
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

export function mapTrainingPlanOwnerIdentity<T extends { profile_id: string | null }>(
  plan: T,
  profileIdentityMap: ProfileIdentityMap,
) {
  return {
    ...plan,
    owner: plan.profile_id ? (profileIdentityMap.get(plan.profile_id) ?? null) : null,
  };
}

export function sanitizeTrainingPlanForViewer<
  T extends TrainingPlanWithIdentityFields & { structure: unknown },
>(plan: T, viewerProfileId: string): T {
  if (
    plan.profile_id === viewerProfileId ||
    !plan.structure ||
    typeof plan.structure !== "object"
  ) {
    return plan;
  }

  const {
    builder_planning_snapshot: _builderSnapshot,
    metadata,
    ...publicStructure
  } = plan.structure as Record<string, unknown>;
  let publicMetadata = metadata;
  if (metadata && typeof metadata === "object") {
    const {
      creation_config_snapshot: _creationConfig,
      creation_form_snapshot: _creationForm,
      creation_calibration: _creationCalibration,
      ...safeMetadata
    } = metadata as Record<string, unknown>;
    publicMetadata = Object.keys(safeMetadata).length > 0 ? safeMetadata : undefined;
  }

  return {
    ...plan,
    structure: {
      ...publicStructure,
      ...(publicMetadata === undefined ? {} : { metadata: publicMetadata }),
    },
  };
}

export function validatePersistedTrainingPlanStructure(plan: TrainingPlanRow) {
  try {
    if (plan.structure) {
      persistedTrainingPlanStructureSchema.parse(plan.structure);
    }
  } catch (validationError) {
    logger.error("Invalid structure in database for training plan", {
      planId: plan.id,
      error: validationError instanceof Error ? validationError.message : "Unknown error",
    });
  }
}

export async function serializeTrainingPlanForViewer(input: {
  db: DrizzleDbClient;
  plan: TrainingPlanRow;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  validatePersistedTrainingPlanStructure(input.plan);

  const [likeStats, profileIdentityMap] = await Promise.all([
    loadLikeStats(input.db, {
      entityType: "training_plan",
      entityIds: [input.plan.id],
      viewerProfileId: input.profileId,
    }),
    loadProfileIdentityMap(input.db, [input.plan.profile_id]),
  ]);

  return {
    ...mapTrainingPlanOwnerIdentity(
      sanitizeTrainingPlanForViewer(input.plan, input.profileId),
      profileIdentityMap,
    ),
    ...getLikeStats(likeStats, input.plan.id),
  };
}
