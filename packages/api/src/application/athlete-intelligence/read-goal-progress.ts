import {
  endOfScheduledDateToIsoInstant,
  evaluateThresholdGoalProgress,
  parseProfileGoalRecord,
  resolveThresholdGoalSupport,
  type ThresholdGoalObservation,
} from "@repo/core";
import { profileGoals } from "@repo/db";
import { and, asc, count, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";

import {
  type GoalPortfolioResponse,
  type GoalProgressResponse,
  goalPortfolioResponseSchema,
  goalProgressResponseSchema,
} from "../../contracts/goal-progress";
import { calculatedThresholdHistoryItemSchema } from "../../contracts/threshold-overview";
import type { DrizzleQueryExecutor } from "../../db";
import {
  type PublishedThresholdHistoryItem,
  readPublishedThresholdHistory,
} from "../../repositories/threshold-overview-repository";
import {
  type PublishedAthleteStateSnapshot,
  readPublishedAthleteStateSnapshot,
} from "./published-athlete-state";

const ownedGoalProgressRowSchema = z
  .object({
    id: z.string().uuid(),
    profile_id: z.string().uuid(),
    target_date: z.string(),
    title: z.string(),
    priority: z.number(),
    activity_category: z.string(),
    target_payload: z.unknown(),
    created_at: z.date(),
  })
  .strict();

export class GoalProgressNotFoundError extends Error {
  constructor() {
    super("Goal not found");
    this.name = "GoalProgressNotFoundError";
  }
}

const compactPortfolioGoalRowSchema = z
  .object({
    activityCategory: z.string().nullable(),
    id: z.string().uuid(),
    priority: z.number().int().min(0).max(10),
    targetDate: z.string(),
    title: z.string().min(1).max(100),
  })
  .strict();

type GoalPortfolioCounts = { activeGoalCount: number; totalGoalCount: number };

export async function readOwnedGoalPortfolio(input: {
  db: DrizzleQueryExecutor;
  planningDate: string;
  profileId: string;
}): Promise<GoalPortfolioCounts & { selectedGoal: unknown | null }> {
  const activeCondition = and(
    eq(profileGoals.profile_id, input.profileId),
    gte(profileGoals.target_date, input.planningDate),
  );
  const [totalRows, activeRows, selectedRows] = await Promise.all([
    input.db
      .select({ total: count() })
      .from(profileGoals)
      .where(eq(profileGoals.profile_id, input.profileId)),
    input.db.select({ total: count() }).from(profileGoals).where(activeCondition),
    input.db
      .select({
        activityCategory: profileGoals.activity_category,
        id: profileGoals.id,
        priority: profileGoals.priority,
        targetDate: profileGoals.target_date,
        title: profileGoals.title,
      })
      .from(profileGoals)
      .where(activeCondition)
      .orderBy(desc(profileGoals.priority), asc(profileGoals.target_date), asc(profileGoals.id))
      .limit(1),
  ]);
  return {
    activeGoalCount: Number(activeRows[0]?.total ?? 0),
    selectedGoal: selectedRows[0] ?? null,
    totalGoalCount: Number(totalRows[0]?.total ?? 0),
  };
}

export async function readOwnedGoalProgressRow(
  db: DrizzleQueryExecutor,
  input: { goalId: string; profileId: string },
): Promise<unknown | null> {
  const [row] = await db
    .select({
      id: profileGoals.id,
      profile_id: profileGoals.profile_id,
      target_date: profileGoals.target_date,
      title: profileGoals.title,
      priority: profileGoals.priority,
      activity_category: profileGoals.activity_category,
      target_payload: profileGoals.target_payload,
      created_at: profileGoals.created_at,
    })
    .from(profileGoals)
    .where(and(eq(profileGoals.id, input.goalId), eq(profileGoals.profile_id, input.profileId)))
    .limit(1);
  return row ?? null;
}

export type GoalProgressReadDependencies = {
  readOwnedGoal: typeof readOwnedGoalProgressRow;
  readSnapshot: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    now?: Date;
  }) => Promise<PublishedAthleteStateSnapshot>;
  readThresholdHistory: (
    db: DrizzleQueryExecutor,
    input: { profileId: string; limit: number },
  ) => Promise<{
    items: PublishedThresholdHistoryItem[];
    nextCursor: unknown;
  }>;
};

export type GoalPortfolioReadDependencies = {
  readPortfolio: typeof readOwnedGoalPortfolio;
  readSnapshot: GoalProgressReadDependencies["readSnapshot"];
};

const defaultDependencies: GoalProgressReadDependencies = {
  readOwnedGoal: readOwnedGoalProgressRow,
  readSnapshot: readPublishedAthleteStateSnapshot,
  readThresholdHistory: readPublishedThresholdHistory,
};

const defaultPortfolioDependencies: GoalPortfolioReadDependencies = {
  readPortfolio: readOwnedGoalPortfolio,
  readSnapshot: readPublishedAthleteStateSnapshot,
};

export async function readGoalPortfolio(input: {
  db: DrizzleQueryExecutor;
  dependencies?: Partial<GoalPortfolioReadDependencies>;
  now?: Date;
  profileId: string;
}): Promise<GoalPortfolioResponse> {
  const dependencies = { ...defaultPortfolioDependencies, ...input.dependencies };
  const snapshot = await dependencies.readSnapshot({
    db: input.db,
    profileId: input.profileId,
    ...(input.now ? { now: input.now } : {}),
  });
  const portfolio = await dependencies.readPortfolio({
    db: input.db,
    planningDate: snapshot.currentPlanningDate,
    profileId: input.profileId,
  });
  return goalPortfolioResponseSchema.parse({
    activeGoalCount: portfolio.activeGoalCount,
    computedAt: snapshot.computedAt,
    freshness: snapshot.freshness,
    planningDate: snapshot.currentPlanningDate,
    publishedRevision: snapshot.revisions.published,
    selectedGoal: portfolio.selectedGoal
      ? compactPortfolioGoalRowSchema.parse(portfolio.selectedGoal)
      : null,
    totalGoalCount: portfolio.totalGoalCount,
  });
}

function historyItemDto(item: PublishedThresholdHistoryItem) {
  return calculatedThresholdHistoryItemSchema.parse({
    thresholdId: item.thresholdId,
    activityCategory: item.activityCategory,
    metric: item.metric,
    unit: item.unit,
    method: item.method,
    value: item.value,
    confidence: item.confidence,
    effectiveAt: item.effectiveAt.toISOString(),
    policyVersion: item.policyVersion,
    sourceActivities: item.sourceActivities.map((activity) => ({
      id: activity.id,
      name: activity.name,
      finishedAt: activity.finishedAt.toISOString(),
    })),
  });
}

function progressObservation(item: ReturnType<typeof historyItemDto>): ThresholdGoalObservation {
  return {
    thresholdId: item.thresholdId,
    activityCategory: item.activityCategory,
    metric: item.metric,
    unit: item.unit,
    value: item.value,
    confidence: item.confidence,
    effectiveAt: item.effectiveAt,
    sourceActivityIds: item.sourceActivities.map(({ id }) => id),
  };
}

export async function readGoalProgress(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  goalId: string;
  now?: Date;
  dependencies?: Partial<GoalProgressReadDependencies>;
}): Promise<GoalProgressResponse> {
  const dependencies = { ...defaultDependencies, ...input.dependencies };
  const rawRow = await dependencies.readOwnedGoal(input.db, {
    goalId: input.goalId,
    profileId: input.profileId,
  });
  if (!rawRow) throw new GoalProgressNotFoundError();

  const row = ownedGoalProgressRowSchema.parse(rawRow);
  const { created_at: createdAt, ...goalRecord } = row;
  const goal = parseProfileGoalRecord(goalRecord);
  const support = resolveThresholdGoalSupport(goal);
  if (support.status === "unsupported") {
    return goalProgressResponseSchema.parse({
      result: support,
      provenance: null,
      publication: null,
    });
  }

  const now = input.now ?? new Date();
  const [snapshot, history] = await Promise.all([
    dependencies.readSnapshot({ db: input.db, profileId: input.profileId, now }),
    dependencies.readThresholdHistory(input.db, { profileId: input.profileId, limit: 100 }),
  ]);
  const historyDtos = history.items.map(historyItemDto);
  const historyObservations = historyDtos.map(progressObservation);
  const currentFact = snapshot.performanceTargets?.thresholds[support.activityCategory] ?? null;
  const currentProvenance =
    currentFact?.status === "available"
      ? (historyDtos.find(({ thresholdId }) => thresholdId === currentFact.thresholdId) ?? null)
      : null;
  const currentThreshold =
    currentFact?.status === "available" && currentProvenance
      ? {
          ...progressObservation(currentProvenance),
          freshness:
            snapshot.freshness === "fresh" && currentFact.freshness === "fresh"
              ? ("fresh" as const)
              : ("stale" as const),
        }
      : null;
  const result = evaluateThresholdGoalProgress({
    goal,
    goalCreatedAt: createdAt.toISOString(),
    assessedAt: now.toISOString(),
    deadlineAt: endOfScheduledDateToIsoInstant({
      scheduledDate: goal.target_date,
      timeZone: snapshot.planningTimezone,
    }),
    currentThreshold,
    thresholdHistory: historyObservations,
    thresholdHistoryComplete: history.nextCursor === null,
  });
  if (result.status === "unsupported") {
    throw new Error("Supported threshold goal unexpectedly became unsupported");
  }
  const provenanceFor = (observation: typeof result.baseline) =>
    observation
      ? (historyDtos.find(({ thresholdId }) => thresholdId === observation.thresholdId) ?? null)
      : null;

  return goalProgressResponseSchema.parse({
    result,
    provenance: {
      baseline: provenanceFor(result.baseline),
      current: provenanceFor(result.current),
    },
    publication: {
      computedAt: snapshot.computedAt,
      status:
        snapshot.freshness === "fresh"
          ? "available"
          : snapshot.freshness === "stale"
            ? "stale"
            : "unavailable",
      publishedRevision: snapshot.revisions.published,
    },
  });
}
