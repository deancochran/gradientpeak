import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import type { TrainingPlanOwnerScope, TrainingPlanRepository } from "../../repositories";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import { loadProfileIdentityMap } from "../../utils/profile-identity";
import {
  mapTrainingPlanContentIdentity,
  mapTrainingPlanOwnerIdentity,
  sanitizeTrainingPlanForViewer,
  serializeTrainingPlanForViewer,
} from "./trainingPlanMapping";

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

  const [likeStats, profileIdentityMap] = await Promise.all([
    loadLikeStats(input.db, {
      entityType: "training_plan",
      entityIds: planIds,
      viewerProfileId: input.profileId,
    }),
    loadProfileIdentityMap(
      input.db,
      pageItems.map((plan) => plan.profile_id),
    ),
  ]);

  return {
    items: pageItems.map((plan) => ({
      ...mapTrainingPlanOwnerIdentity(
        mapTrainingPlanContentIdentity(sanitizeTrainingPlanForViewer(plan, input.profileId)),
        profileIdentityMap,
      ),
      ...getLikeStats(likeStats, plan.id),
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
