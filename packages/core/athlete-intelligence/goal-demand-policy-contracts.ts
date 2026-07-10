import { z } from "zod";
import {
  type CalculationReasonCode,
  calculationReasonCodeSchema,
} from "./calculation-result-contracts";
import { type SourceId, sourceIdSchema } from "./lineage";

export const goalDemandReasonCodeSchema = calculationReasonCodeSchema;

export const goalSourceIdSchema = sourceIdSchema.refine(
  (value) => value.startsWith("goal:"),
  "Goal source ID must use the goal: namespace",
);

export const goalDemandPolicyInputSchema = z
  .object({
    policyVersion: z.string().min(1),
    athleteId: z.string().min(1),
    goalSourceId: goalSourceIdSchema,
    goalType: z.string().min(1),
    sport: z.string().min(1).nullable(),
    distanceMeters: z.number().positive().nullable(),
    targetDurationSeconds: z.number().positive().nullable(),
    targetPowerWatts: z.number().positive().nullable(),
    targetHeartRateBpm: z.number().positive().nullable(),
    routeDistanceMeters: z.number().positive().nullable(),
    routeAscentMeters: z.number().nonnegative().nullable(),
    targetDate: z.string().date().nullable(),
  })
  .strict();

export const goalDemandPolicyStateSchema = z.enum(["complete", "incomplete", "unsupported"]);

const goalDemandResultIdentitySchema = z.object({
  policyVersion: z.string().min(1),
  goalSourceId: goalSourceIdSchema,
});

/** Reserved until a capability-demand contract and policy are approved. */
export const completeGoalDemandPolicyResultSchema = goalDemandResultIdentitySchema
  .extend({
    state: z.literal("complete"),
    reasonCodes: z.array(goalDemandReasonCodeSchema),
    missingFields: z.array(z.string().min(1)).max(0),
  })
  .strict()
  .refine(() => false, {
    message: "Complete goal demand requires a future approved demand contract",
  });

export const incompleteGoalDemandPolicyResultSchema = goalDemandResultIdentitySchema
  .extend({
    state: z.literal("incomplete"),
    reasonCodes: z.array(goalDemandReasonCodeSchema).nonempty(),
    missingFields: z.array(z.string().min(1)).nonempty(),
  })
  .strict();

export const unsupportedGoalDemandPolicyResultSchema = goalDemandResultIdentitySchema
  .extend({
    state: z.literal("unsupported"),
    reasonCodes: z.array(goalDemandReasonCodeSchema).nonempty(),
    missingFields: z.array(z.string().min(1)).max(0),
  })
  .strict();

export const goalDemandPolicyResultSchema = z.union([
  completeGoalDemandPolicyResultSchema,
  incompleteGoalDemandPolicyResultSchema,
  unsupportedGoalDemandPolicyResultSchema,
]);

export type GoalDemandReasonCode = CalculationReasonCode;
export type GoalSourceId = z.infer<typeof goalSourceIdSchema>;
export type GoalDemandPolicyInput = z.infer<typeof goalDemandPolicyInputSchema>;
export type CompleteGoalDemandPolicyResult = z.infer<typeof completeGoalDemandPolicyResultSchema>;
export type IncompleteGoalDemandPolicyResult = z.infer<
  typeof incompleteGoalDemandPolicyResultSchema
>;
export type UnsupportedGoalDemandPolicyResult = z.infer<
  typeof unsupportedGoalDemandPolicyResultSchema
>;
export type GoalDemandPolicyResult = z.infer<typeof goalDemandPolicyResultSchema>;

export function incompleteGoalDemandResult(input: {
  policyVersion: string;
  goalSourceId: SourceId;
  missingFields: readonly [string, ...string[]];
  reasonCodes: readonly [GoalDemandReasonCode, ...GoalDemandReasonCode[]];
}): IncompleteGoalDemandPolicyResult {
  return incompleteGoalDemandPolicyResultSchema.parse({
    policyVersion: input.policyVersion,
    goalSourceId: input.goalSourceId,
    state: "incomplete",
    reasonCodes: input.reasonCodes,
    missingFields: input.missingFields,
  });
}

export function unsupportedGoalDemandResult(input: {
  policyVersion: string;
  goalSourceId: SourceId;
  reasonCodes: readonly [GoalDemandReasonCode, ...GoalDemandReasonCode[]];
}): UnsupportedGoalDemandPolicyResult {
  return unsupportedGoalDemandPolicyResultSchema.parse({
    policyVersion: input.policyVersion,
    goalSourceId: input.goalSourceId,
    state: "unsupported",
    reasonCodes: input.reasonCodes,
    missingFields: [],
  });
}
