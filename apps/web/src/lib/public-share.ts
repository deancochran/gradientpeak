import type { TrainingPlan } from "@repo/core";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { z } from "zod";

type ShareEntity = "activity" | "workout" | "training-plan";

const shareInputSchema = z.object({ id: z.string().uuid() }).strict();

const serializableObjectiveSchema = z.json();
type SerializableObjective = z.infer<typeof serializableObjectiveSchema>;
type TrainingPlanGoalBlueprint = NonNullable<TrainingPlan["goal_blueprints"]>[number];
type PublicTrainingPlanGoalBlueprint = Omit<TrainingPlanGoalBlueprint, "objective"> & {
  objective?: SerializableObjective;
};
type PublicTrainingPlanStructure = Omit<
  TrainingPlan,
  "builder_planning_snapshot" | "goal_blueprints"
> & {
  goal_blueprints?: PublicTrainingPlanGoalBlueprint[];
};

export function projectPublicTrainingPlanStructure(
  structure: TrainingPlan,
): PublicTrainingPlanStructure {
  const {
    builder_planning_snapshot: _builderPlanningSnapshot,
    goal_blueprints: goalBlueprints,
    ...publicStructure
  } = structure;
  const projectedGoalBlueprints = goalBlueprints?.map(({ objective, ...blueprint }) => {
    const parsedObjective = serializableObjectiveSchema.safeParse(objective);
    return parsedObjective.success ? { ...blueprint, objective: parsedObjective.data } : blueprint;
  });

  return projectedGoalBlueprints
    ? { ...publicStructure, goal_blueprints: projectedGoalBlueprints }
    : publicStructure;
}

function getOriginFromHeaders(headers: Headers) {
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost ?? headers.get("host") ?? "localhost:3000";
  const forwardedProto = headers.get("x-forwarded-proto");
  const proto = forwardedProto ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function getPublicSharePath(entity: ShareEntity, id: string) {
  switch (entity) {
    case "activity":
      return `/share/activities/${id}`;
    case "workout":
      return `/share/workouts/${id}`;
    case "training-plan":
      return `/share/training-plans/${id}`;
  }
}

export function getPublicShareUrl(origin: string, entity: ShareEntity, id: string) {
  return new URL(getPublicSharePath(entity, id), origin).toString();
}

async function createPublicShareCaller() {
  const [{ appRouter, createApiContext }, { db }] = await Promise.all([
    import("@repo/api/server"),
    import("@repo/db/client"),
  ]);
  const headers = getRequestHeaders();
  const context = await createApiContext({
    headers,
    auth: { session: null },
    db,
  });
  return { caller: appRouter.createCaller(context), origin: getOriginFromHeaders(headers) };
}

export const loadPublicActivity = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const activity = await caller.publicShare.activity({ id: data.id });
    return activity
      ? {
          activity,
          canonicalUrl: getPublicShareUrl(origin, "activity", activity.id),
        }
      : null;
  });

export const loadPublicWorkout = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const workout = await caller.publicShare.workout({ id: data.id });
    return workout
      ? {
          workout,
          canonicalUrl: getPublicShareUrl(origin, "workout", workout.id),
        }
      : null;
  });

export const loadPublicTrainingPlan = createServerFn({ method: "GET" })
  .validator(shareInputSchema)
  .handler(async ({ data }) => {
    const { caller, origin } = await createPublicShareCaller();
    const trainingPlan = await caller.publicShare.trainingPlan({ id: data.id });
    return trainingPlan
      ? {
          trainingPlan: {
            ...trainingPlan,
            structure: projectPublicTrainingPlanStructure(trainingPlan.structure),
          },
          canonicalUrl: getPublicShareUrl(origin, "training-plan", trainingPlan.id),
        }
      : null;
  });

export function describeStructure(structure: unknown) {
  if (!structure || typeof structure !== "object") return "Structured workout details";

  const record = structure as Record<string, unknown>;
  const steps = Array.isArray(record.steps) ? record.steps : null;
  const weeks = Array.isArray(record.weeks) ? record.weeks : null;
  const phases = Array.isArray(record.phases) ? record.phases : null;

  if (steps) return `${steps.length} workout step${steps.length === 1 ? "" : "s"}`;
  if (weeks) return `${weeks.length} week${weeks.length === 1 ? "" : "s"}`;
  if (phases) return `${phases.length} training phase${phases.length === 1 ? "" : "s"}`;

  return "Structured plan details";
}
