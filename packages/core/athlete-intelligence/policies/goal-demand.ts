import { z } from "zod";

import { canonicalGoalSchema } from "../../schemas/goals/profile_goals";
import {
  calculationResultSchema,
  estimatedResult,
  observedResult,
} from "../calculation-result-contracts";
import { type SourceId, sourceIdSchema } from "../lineage";

export const GOAL_DEMAND_POLICY_VERSION = "goal-demand-v1" as const;

const routeContextSchema = z
  .object({
    sourceId: sourceIdSchema,
    distanceMeters: z.number().positive().optional(),
    ascentMeters: z.number().nonnegative().optional(),
  })
  .strict();

export const goalDemandPolicyV1InputSchema = z
  .object({
    goal: z.unknown(),
    route: routeContextSchema.optional(),
  })
  .strict();

const resultIdentitySchema = z.object({
  policyVersion: z.literal(GOAL_DEMAND_POLICY_VERSION),
  goalSourceId: sourceIdSchema.nullable(),
});

const eventPerformanceRequirementSchema = z
  .object({
    type: z.literal("event_performance"),
    requiredDistance: calculationResultSchema,
    requiredDuration: calculationResultSchema,
    requiredSpeed: calculationResultSchema,
    routeDistance: calculationResultSchema.optional(),
    routeAscent: calculationResultSchema.optional(),
  })
  .strict();

const thresholdRequirementSchema = z.discriminatedUnion("metric", [
  z
    .object({
      type: z.literal("threshold"),
      metric: z.literal("pace"),
      target: calculationResultSchema,
      testDuration: calculationResultSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("threshold"),
      metric: z.literal("power"),
      target: calculationResultSchema,
      testDuration: calculationResultSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("threshold"),
      metric: z.literal("hr"),
      target: calculationResultSchema,
      testDuration: calculationResultSchema,
    })
    .strict(),
]);

const completionRequirementSchema = z
  .object({
    type: z.literal("completion"),
    requiredDistance: calculationResultSchema.optional(),
    requiredDuration: calculationResultSchema.optional(),
  })
  .strict();

const consistencyRequirementSchema = z
  .object({
    type: z.literal("consistency"),
    sessionsPerWeek: calculationResultSchema,
    weeks: calculationResultSchema,
  })
  .strict();

const completeGoalDemandResultSchema = resultIdentitySchema
  .extend({
    state: z.literal("complete"),
    missingFields: z.array(z.string()).max(0),
    requirement: z.discriminatedUnion("type", [
      eventPerformanceRequirementSchema,
      thresholdRequirementSchema,
      completionRequirementSchema,
      consistencyRequirementSchema,
    ]),
  })
  .strict();

const incompleteGoalDemandResultSchema = resultIdentitySchema
  .extend({
    state: z.literal("incomplete"),
    missingFields: z.array(z.string().min(1)).nonempty(),
  })
  .strict();

const unsupportedGoalDemandResultSchema = resultIdentitySchema
  .extend({
    state: z.literal("unsupported"),
    missingFields: z.array(z.string()).max(0),
  })
  .strict();

export const goalDemandPolicyV1ResultSchema = z.discriminatedUnion("state", [
  completeGoalDemandResultSchema,
  incompleteGoalDemandResultSchema,
  unsupportedGoalDemandResultSchema,
]);

export type GoalDemandPolicyV1Result = z.infer<typeof goalDemandPolicyV1ResultSchema>;

function sourceIdForGoal(input: unknown): SourceId | null {
  if (typeof input !== "object" || input === null || !("id" in input)) return null;
  if (typeof input.id !== "string") return null;
  const source = sourceIdSchema.safeParse(`goal:${input.id}`);
  return source.success ? source.data : null;
}

function missingGoalFields(input: unknown): string[] {
  const parsed = canonicalGoalSchema.safeParse(input);
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "goal"))].sort();
}

function directResult(value: number, unit: string, sourceId: SourceId) {
  return observedResult({ rawValue: value, unit, sourceId, uncertainty: 0 });
}

function derivedSpeedResult(distanceMeters: number, durationSeconds: number, sourceId: SourceId) {
  return estimatedResult({
    estimate: distanceMeters / durationSeconds,
    unit: "m/s",
    uncertainty: 0,
    reasonCodes: ["goal_speed_derived_from_distance_and_duration"],
    contributingSourceIds: [sourceId],
  });
}

function derivedDurationResult(durationSeconds: number, sourceId: SourceId) {
  return estimatedResult({
    estimate: durationSeconds,
    unit: "s",
    uncertainty: 0,
    reasonCodes: ["goal_duration_derived_from_distance_and_speed"],
    contributingSourceIds: [sourceId],
  });
}

/** Returns only the direct, canonical physical requirements expressed by a goal. */
export function calculateGoalDemandV1(
  input: z.input<typeof goalDemandPolicyV1InputSchema>,
): GoalDemandPolicyV1Result {
  const parsedInput = goalDemandPolicyV1InputSchema.parse(input);
  const goalSourceId = sourceIdForGoal(parsedInput.goal);
  const rawObjective =
    typeof parsedInput.goal === "object" &&
    parsedInput.goal !== null &&
    "objective" in parsedInput.goal
      ? parsedInput.goal.objective
      : undefined;
  const rawType =
    typeof rawObjective === "object" && rawObjective !== null && "type" in rawObjective
      ? rawObjective.type
      : undefined;
  const supportedTypes = new Set(["event_performance", "threshold", "completion", "consistency"]);

  if (typeof rawType === "string" && !supportedTypes.has(rawType)) {
    return goalDemandPolicyV1ResultSchema.parse({
      policyVersion: GOAL_DEMAND_POLICY_VERSION,
      state: "unsupported",
      goalSourceId,
      missingFields: [],
    });
  }

  const parsedGoal = canonicalGoalSchema.safeParse(parsedInput.goal);
  if (!parsedGoal.success || goalSourceId === null) {
    const missingFields = missingGoalFields(parsedInput.goal);
    if (goalSourceId === null && !missingFields.includes("id")) missingFields.push("id");
    return goalDemandPolicyV1ResultSchema.parse({
      policyVersion: GOAL_DEMAND_POLICY_VERSION,
      state: "incomplete",
      goalSourceId,
      missingFields: missingFields.sort(),
    });
  }

  const objective = parsedGoal.data.objective;
  const policyMissingFields: string[] = [];
  if (objective.type === "threshold" && objective.test_duration_s === undefined) {
    policyMissingFields.push("objective.test_duration_s");
  }
  if (objective.type === "consistency") {
    if (objective.target_sessions_per_week === undefined) {
      policyMissingFields.push("objective.target_sessions_per_week");
    }
    if (objective.target_weeks === undefined) policyMissingFields.push("objective.target_weeks");
  }
  if (policyMissingFields.length > 0) {
    return goalDemandPolicyV1ResultSchema.parse({
      policyVersion: GOAL_DEMAND_POLICY_VERSION,
      state: "incomplete",
      goalSourceId,
      missingFields: policyMissingFields,
    });
  }

  let requirement: z.input<typeof completeGoalDemandResultSchema>["requirement"];
  switch (objective.type) {
    case "event_performance": {
      const distance = objective.distance_m;
      if (distance === undefined) {
        return goalDemandPolicyV1ResultSchema.parse({
          policyVersion: GOAL_DEMAND_POLICY_VERSION,
          state: "incomplete",
          goalSourceId,
          missingFields: ["objective.distance_m"],
        });
      }
      if (objective.target_time_s === undefined && objective.target_speed_mps === undefined) {
        return goalDemandPolicyV1ResultSchema.parse({
          policyVersion: GOAL_DEMAND_POLICY_VERSION,
          state: "incomplete",
          goalSourceId,
          missingFields: ["objective.target_time_s"],
        });
      }
      const duration =
        objective.target_time_s ??
        (objective.target_speed_mps === undefined
          ? undefined
          : distance / objective.target_speed_mps);
      if (duration === undefined) {
        return goalDemandPolicyV1ResultSchema.parse({
          policyVersion: GOAL_DEMAND_POLICY_VERSION,
          state: "incomplete",
          goalSourceId,
          missingFields: ["objective.target_time_s"],
        });
      }
      requirement = {
        type: "event_performance",
        requiredDistance: directResult(distance, "m", goalSourceId),
        requiredDuration:
          objective.target_time_s === undefined
            ? derivedDurationResult(duration, goalSourceId)
            : directResult(objective.target_time_s, "s", goalSourceId),
        requiredSpeed:
          objective.target_speed_mps === undefined
            ? derivedSpeedResult(distance, duration, goalSourceId)
            : directResult(objective.target_speed_mps, "m/s", goalSourceId),
        ...(parsedInput.route?.distanceMeters === undefined
          ? {}
          : {
              routeDistance: directResult(
                parsedInput.route.distanceMeters,
                "m",
                parsedInput.route.sourceId,
              ),
            }),
        ...(parsedInput.route?.ascentMeters === undefined
          ? {}
          : {
              routeAscent: directResult(
                parsedInput.route.ascentMeters,
                "m",
                parsedInput.route.sourceId,
              ),
            }),
      };
      break;
    }
    case "threshold": {
      if (objective.test_duration_s === undefined) {
        return goalDemandPolicyV1ResultSchema.parse({
          policyVersion: GOAL_DEMAND_POLICY_VERSION,
          state: "incomplete",
          goalSourceId,
          missingFields: ["objective.test_duration_s"],
        });
      }
      const unit = objective.metric === "pace" ? "m/s" : objective.metric === "power" ? "W" : "bpm";
      requirement = {
        type: "threshold",
        metric: objective.metric,
        target: directResult(objective.value, unit, goalSourceId),
        testDuration: directResult(objective.test_duration_s, "s", goalSourceId),
      };
      break;
    }
    case "completion":
      requirement = {
        type: "completion",
        ...(objective.distance_m === undefined
          ? {}
          : { requiredDistance: directResult(objective.distance_m, "m", goalSourceId) }),
        ...(objective.duration_s === undefined
          ? {}
          : { requiredDuration: directResult(objective.duration_s, "s", goalSourceId) }),
      };
      break;
    case "consistency":
      if (
        objective.target_sessions_per_week === undefined ||
        objective.target_weeks === undefined
      ) {
        return goalDemandPolicyV1ResultSchema.parse({
          policyVersion: GOAL_DEMAND_POLICY_VERSION,
          state: "incomplete",
          goalSourceId,
          missingFields: [
            ...(objective.target_sessions_per_week === undefined
              ? ["objective.target_sessions_per_week"]
              : []),
            ...(objective.target_weeks === undefined ? ["objective.target_weeks"] : []),
          ],
        });
      }
      requirement = {
        type: "consistency",
        sessionsPerWeek: directResult(
          objective.target_sessions_per_week,
          "sessions/week",
          goalSourceId,
        ),
        weeks: directResult(objective.target_weeks, "weeks", goalSourceId),
      };
      break;
  }

  return goalDemandPolicyV1ResultSchema.parse({
    policyVersion: GOAL_DEMAND_POLICY_VERSION,
    state: "complete",
    goalSourceId,
    missingFields: [],
    requirement,
  });
}
