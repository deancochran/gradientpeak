import { persistedTrainingPlanStructureSchema } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import type { TrainingPlanRepository } from "../../repositories";
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

  const [hasLiked, profileIdentityMap] = await Promise.all([
    input.repository.hasTrainingPlanLike({
      profileId: input.profileId,
      planId: input.plan.id,
    }),
    loadProfileIdentityMap(input.db, [input.plan.profile_id]),
  ]);

  return {
    ...mapTrainingPlanOwnerIdentity(input.plan, profileIdentityMap),
    has_liked: hasLiked,
  };
}
