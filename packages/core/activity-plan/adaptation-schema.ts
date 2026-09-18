import { z } from "zod";
import { activityTargetDefinitionByType, activityTargetTypeSchema } from "../targets/schema";

const finiteNumberSchema = z.number().finite();
const authoredIdSchema = z.string().uuid();
const controlKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/);

/** A bounded authored numeric range expressed in the target field's canonical unit. */
export const semanticNumericRangeSchema = z
  .object({
    minimum: finiteNumberSchema,
    default: finiteNumberSchema,
    maximum: finiteNumberSchema,
    increment: finiteNumberSchema.positive(),
  })
  .strict()
  .superRefine((range, context) => {
    if (range.minimum > range.default || range.default > range.maximum) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "Default must be within the declared range.",
      });
    }
    for (const field of ["default", "maximum"] as const) {
      const steps = (range[field] - range.minimum) / range.increment;
      if (!Number.isSafeInteger(Math.round(steps)) || Math.abs(steps - Math.round(steps)) > 1e-9) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Range values must align with the declared increment.",
        });
      }
    }
  });

export type SemanticNumericRange = z.output<typeof semanticNumericRangeSchema>;

const activityNodeTarget = {
  activitySegmentId: authoredIdSchema,
  intervalId: authoredIdSchema,
} as const;
const activityStepTarget = { ...activityNodeTarget, stepId: authoredIdSchema } as const;

export const adaptationTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("interval_repetitions"), ...activityNodeTarget }).strict(),
  z
    .object({
      type: z.literal("step_quantity"),
      ...activityStepTarget,
      quantityType: z.enum(["time", "distance", "repetitions"]),
    })
    .strict(),
  z.object({ type: z.literal("rest_segment"), segmentId: authoredIdSchema }).strict(),
  z
    .object({
      type: z.literal("recovery_step"),
      ...activityStepTarget,
      quantityType: z.enum(["time", "distance", "repetitions"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("target_intensity"),
      ...activityStepTarget,
      targetType: activityTargetTypeSchema,
    })
    .strict(),
]);
export type AdaptationTarget = z.output<typeof adaptationTargetSchema>;

export const adaptationControlSchema = z
  .object({
    id: authoredIdSchema,
    key: controlKeySchema,
    label: z.string().trim().min(1).max(100),
    kind: z.enum([
      "interval_repetitions",
      "step_quantity",
      "recovery_quantity",
      "target_intensity",
    ]),
    range: semanticNumericRangeSchema,
    targets: z.array(adaptationTargetSchema).min(1).max(64),
  })
  .strict()
  .superRefine((control, context) => {
    const validTargetTypes =
      control.kind === "recovery_quantity"
        ? new Set(["rest_segment", "recovery_step"])
        : new Set([control.kind]);
    control.targets.forEach((target, index) => {
      if (!validTargetTypes.has(target.type)) {
        context.addIssue({
          code: "custom",
          path: ["targets", index, "type"],
          message: `Target type ${target.type} is incompatible with control kind ${control.kind}.`,
        });
      }
      if (target.type === "target_intensity") {
        const definition = activityTargetDefinitionByType[target.targetType];
        const invalidMinimum =
          "exclusiveMinimum" in definition && definition.exclusiveMinimum
            ? control.range.minimum <= definition.minimum
            : control.range.minimum < definition.minimum;
        if (invalidMinimum || control.range.maximum > definition.saveableMaximum)
          context.addIssue({
            code: "custom",
            path: ["range"],
            message: `Intensity range must stay within the saveable ${target.targetType} bounds.`,
          });
      } else if (
        !Number.isInteger(control.range.minimum) ||
        !Number.isInteger(control.range.default) ||
        !Number.isInteger(control.range.maximum) ||
        !Number.isInteger(control.range.increment) ||
        control.range.minimum < 1
      ) {
        context.addIssue({
          code: "custom",
          path: ["range"],
          message: "Quantity controls require positive integer bounds and increments.",
        });
      }
    });
    const unitKeys = new Set(
      control.targets.map((target) => {
        if (target.type === "interval_repetitions") return "interval_repetitions";
        if (target.type === "rest_segment") return "time";
        if (target.type === "target_intensity") return `intensity:${target.targetType}`;
        return target.quantityType;
      }),
    );
    if (unitKeys.size > 1)
      context.addIssue({
        code: "custom",
        path: ["targets"],
        message: "Every target owned by one control must use the same canonical unit.",
      });
  });
export type AdaptationControl = z.output<typeof adaptationControlSchema>;

export const adaptationStateSchema = z
  .object({
    id: authoredIdSchema,
    label: z.string().trim().min(1).max(100),
    values: z.record(controlKeySchema, finiteNumberSchema),
  })
  .strict();
export type AdaptationState = z.output<typeof adaptationStateSchema>;

/** Complete hard-cut semantic adaptation contract. */
export const activityPlanAdaptationSchema = z
  .object({
    controls: z.array(adaptationControlSchema).min(1).max(32),
    allowedStates: z.array(adaptationStateSchema).min(1).max(10_000).optional(),
  })
  .strict()
  .superRefine((adaptation, context) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    adaptation.controls.forEach((control, index) => {
      if (ids.has(control.id))
        context.addIssue({
          code: "custom",
          path: ["controls", index, "id"],
          message: "Control IDs must be unique.",
        });
      if (keys.has(control.key))
        context.addIssue({
          code: "custom",
          path: ["controls", index, "key"],
          message: "Control keys must be unique.",
        });
      ids.add(control.id);
      keys.add(control.key);
    });
    const stateIds = new Set<string>();
    const stateValues = new Set<string>();
    let includesDefaults = adaptation.allowedStates === undefined;
    adaptation.allowedStates?.forEach((state, stateIndex) => {
      if (stateIds.has(state.id))
        context.addIssue({
          code: "custom",
          path: ["allowedStates", stateIndex, "id"],
          message: "Allowed-state IDs must be unique.",
        });
      stateIds.add(state.id);
      const canonicalValues = adaptation.controls
        .map((control) => `${control.key}:${state.values[control.key]}`)
        .join("|");
      if (stateValues.has(canonicalValues))
        context.addIssue({
          code: "custom",
          path: ["allowedStates", stateIndex, "values"],
          message: "Allowed-state value tuples must be unique.",
        });
      stateValues.add(canonicalValues);
      const stateKeys = Object.keys(state.values);
      if (stateKeys.length !== keys.size || stateKeys.some((key) => !keys.has(key))) {
        context.addIssue({
          code: "custom",
          path: ["allowedStates", stateIndex, "values"],
          message: "Every allowed state must define exactly every control key.",
        });
      }
      for (const control of adaptation.controls) {
        const value = state.values[control.key];
        if (value === undefined) continue;
        const steps = (value - control.range.minimum) / control.range.increment;
        if (
          value < control.range.minimum ||
          value > control.range.maximum ||
          Math.abs(steps - Math.round(steps)) > 1e-9
        ) {
          context.addIssue({
            code: "custom",
            path: ["allowedStates", stateIndex, "values", control.key],
            message: "Allowed-state value is outside the control range or increment.",
          });
        }
      }
      if (
        adaptation.controls.every((control) => state.values[control.key] === control.range.default)
      )
        includesDefaults = true;
    });
    if (!includesDefaults)
      context.addIssue({
        code: "custom",
        path: ["allowedStates"],
        message: "Allowed states must include the complete authored-default tuple.",
      });
  });

export type ActivityPlanAdaptation = z.output<typeof activityPlanAdaptationSchema>;
export type ActivityPlanAdaptationValues = Record<string, number>;
