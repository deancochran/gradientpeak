import type { DrizzleDbClient } from "@repo/db/client";
import { TRPCError } from "@trpc/server";
import type { TrainingPlanOwnerScope, TrainingPlanRepository } from "../../repositories";
import { getLikeStats, loadLikeStats } from "../../repositories/like-stats";
import { buildIndexPageInfo, parseIndexCursor } from "../../utils/index-cursor";
import { loadProfileIdentityMap } from "../../utils/profile-identity";
import { getTrainingPlanEditorMetadata } from "./projection-planning";
import {
  mapTrainingPlanContentIdentity,
  mapTrainingPlanOwnerIdentity,
  mapTrainingPlanPlannedSchedulePreview,
  sanitizeTrainingPlanForViewer,
  serializeTrainingPlanForViewer,
} from "./trainingPlanMapping";

type TrainingPlanListInput = {
  cursor?: string;
  limit: number;
  ownerScope: TrainingPlanOwnerScope;
  search?: string;
  visibility?: "private" | "followers" | "public";
};

export async function getTrainingPlanUseCase(input: {
  db: DrizzleDbClient;
  id: string;
  profileId: string;
  repository: TrainingPlanRepository;
}) {
  const plan = await input.repository.getAccessibleTrainingPlan({
    id: input.id,
    profileId: input.profileId,
  });

  if (!plan) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Training plan not found" });
  }

  const serialized = await serializeTrainingPlanForViewer({ ...input, plan });
  return {
    ...serialized,
    editor: await getTrainingPlanEditorMetadata({
      db: input.db,
      profileId: input.profileId,
      plan,
    }),
  };
}

export async function listTrainingPlansUseCase(input: {
  db: DrizzleDbClient;
  profileId: string;
  query: TrainingPlanListInput;
  repository: TrainingPlanRepository;
}) {
  const ownerScope = input.query.ownerScope;

  const offset = parseIndexCursor(input.query.cursor);
  const page = await input.repository.listTrainingPlansPage({
    limit: input.query.limit,
    offset,
    profileId: input.profileId,
    ownerScope,
    ...(input.query.visibility === undefined ? {} : { visibility: input.query.visibility }),
    ...(input.query.search === undefined ? {} : { search: input.query.search }),
  });
  const pageItems = page.items;
  const pageInfo = buildIndexPageInfo({ offset, limit: input.query.limit, total: page.total });
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
        mapTrainingPlanContentIdentity(
          mapTrainingPlanPlannedSchedulePreview(
            sanitizeTrainingPlanForViewer(plan, input.profileId),
          ),
        ),
        profileIdentityMap,
      ),
      ...getLikeStats(likeStats, plan.id),
    })),
    total: page.total,
    ...pageInfo,
  };
}
