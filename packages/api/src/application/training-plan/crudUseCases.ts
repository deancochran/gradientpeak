import { persistedTrainingPlanStructureSchema } from "@repo/core";
import type { TrainingPlanRow } from "@repo/db";
import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import { logger } from "../../lib/logger";
import type { TrainingPlanOwnerScope, TrainingPlanRepository } from "../../repositories";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import { loadProfileIdentityMap, type profileIdentitySchema } from "../../utils/profile-identity";

type TrainingPlanListOwnerScope = TrainingPlanOwnerScope | "none";

type TrainingPlanListInput = {
  cursor?: string;
  direction?: "forward" | "backward";
  includeOwnOnly?: boolean;
  includeSystemTemplates?: boolean;
  limit: number;
  ownerScope?: TrainingPlanOwnerScope;
  search?: string;
  visibility?: "private" | "public";
};

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

function withTrainingPlanOwnerIdentity<T extends { profile_id: string | null }>(
  plan: T,
  profileIdentityMap: Map<string, z.infer<typeof profileIdentitySchema>>,
) {
  return {
    ...plan,
    owner: plan.profile_id ? (profileIdentityMap.get(plan.profile_id) ?? null) : null,
  };
}

function validatePersistedStructure(plan: TrainingPlanRow) {
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

async function serializeTrainingPlanForViewer(input: {
  db: DrizzleDbClient;
  plan: TrainingPlanRow;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  validatePersistedStructure(input.plan);

  const [hasLiked, profileIdentityMap] = await Promise.all([
    input.repository.hasTrainingPlanLike({
      profileId: input.profileId,
      planId: input.plan.id,
    }),
    loadProfileIdentityMap(input.db, [input.plan.profile_id]),
  ]);

  return {
    ...withTrainingPlanOwnerIdentity(input.plan, profileIdentityMap),
    has_liked: hasLiked,
  };
}

function resolveOwnerScope(input: TrainingPlanListInput): TrainingPlanListOwnerScope {
  if (input.ownerScope) {
    return input.ownerScope;
  }

  const includeOwnOnly = input.includeOwnOnly ?? true;
  const includeSystemTemplates = input.includeSystemTemplates ?? false;
  return includeOwnOnly
    ? includeSystemTemplates
      ? "all"
      : "own"
    : includeSystemTemplates
      ? "system"
      : "none";
}

export async function getTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  id?: string;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  if (input.id) {
    const plan = await input.repository.getAccessibleTrainingPlan({
      id: input.id,
      profileId: input.profileId,
    });

    if (!plan) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Training plan not found" });
    }

    return serializeTrainingPlanForViewer({ ...input, plan });
  }

  const activePlanLookup = await input.repository.getActivePlanFromFutureEvents(input.profileId);
  if (!activePlanLookup) {
    return null;
  }

  return serializeTrainingPlanForViewer({ ...input, plan: activePlanLookup.trainingPlan });
}

export async function getTrainingPlanByIdUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  return getTrainingPlanUseCase(input);
}

export async function listTrainingPlansUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  query: TrainingPlanListInput;
  repository: TrainingPlanRepository;
}) {
  const ownerScope = resolveOwnerScope(input.query);
  if (ownerScope === "none") {
    return { items: [], total: 0, hasMore: false, nextCursor: undefined };
  }

  const offset = parseIndexCursor(input.query.cursor);
  const data = await input.repository.listTrainingPlans({
    profileId: input.profileId,
    ownerScope,
    visibility: input.query.visibility,
  });

  const normalizedSearch = input.query.search?.toLowerCase() ?? "";
  const filteredData = normalizedSearch
    ? data.filter((plan) => {
        return [plan.name, plan.description]
          .filter((value) => typeof value === "string")
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
    : data;

  const total = filteredData.length;
  const pageItems = filteredData.slice(offset, offset + input.query.limit);
  const pageInfo = buildIndexPageInfo({ offset, limit: input.query.limit, total });
  const planIds = pageItems.map((plan) => plan.id);

  const [userLikes, profileIdentityMap] = await Promise.all([
    input.repository.listTrainingPlanLikedIds({ profileId: input.profileId, planIds }),
    loadProfileIdentityMap(
      input.db,
      pageItems.map((plan) => plan.profile_id),
    ),
  ]);

  return {
    items: pageItems.map((plan) => ({
      ...withTrainingPlanOwnerIdentity(withTrainingPlanIdentity(plan), profileIdentityMap),
      has_liked: userLikes.includes(plan.id),
    })),
    total,
    ...pageInfo,
  };
}

export async function trainingPlanExistsUseCase(input: {
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const count = await input.repository.countOwnedTrainingPlans(input.profileId);
  return { exists: count > 0, count };
}
