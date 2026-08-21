import { z } from "zod";

export const apiCacheTagSchema = z.enum([
  "activities.getById",
  "activities.listPaginated",
  "activityFiles.getIngestionStatus",
  "activityPlans.getById",
  "athleteIntelligence.getThresholdEvidence",
  "athleteIntelligence.getTrainingEffects",
  "calendar.day",
  "calendar.range",
  "home.getDashboard",
  "plannedSessions.range",
  "trainingPlans.get",
  "trainingPlans.getPlanTabProjection",
  "trainingPlans.getPlanningLedger",
  "trainingPlans.list",
]);

export type ApiCacheTag = z.infer<typeof apiCacheTagSchema>;

export const ATHLETE_STATE_CACHE_TAGS = [
  "athleteIntelligence.getThresholdEvidence",
  "athleteIntelligence.getTrainingEffects",
  "home.getDashboard",
] as const;

export const PLANNED_SESSION_CACHE_TAGS = [
  "plannedSessions.range",
  "calendar.range",
  "calendar.day",
  "trainingPlans.getPlanningLedger",
  "trainingPlans.getPlanTabProjection",
  "trainingPlans.get",
  "trainingPlans.list",
  "activityPlans.getById",
  "activities.getById",
  "activities.listPaginated",
  "home.getDashboard",
] as const;

export const athleteStateCacheTagsSchema = z.tuple(
  ATHLETE_STATE_CACHE_TAGS.map((tag) => z.literal(tag)) as [
    z.ZodLiteral<(typeof ATHLETE_STATE_CACHE_TAGS)[0]>,
    z.ZodLiteral<(typeof ATHLETE_STATE_CACHE_TAGS)[1]>,
    z.ZodLiteral<(typeof ATHLETE_STATE_CACHE_TAGS)[2]>,
  ],
);

export const plannedSessionCacheTagsSchema = z.tuple([
  z.literal(PLANNED_SESSION_CACHE_TAGS[0]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[1]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[2]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[3]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[4]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[5]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[6]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[7]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[8]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[9]),
  z.literal(PLANNED_SESSION_CACHE_TAGS[10]),
]);
