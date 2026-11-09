import { z } from "zod";

export const activityPlanCompletionPolicySchema = z.enum([
  "time",
  "distance",
  "repetitions",
  "untilFinished",
]);
export type ActivityPlanCompletionPolicy = z.infer<typeof activityPlanCompletionPolicySchema>;

export const activityPlanProjectionWeightingBasisSchema = z.enum([
  "duration_seconds",
  "distance_meters",
  "repetition_count",
  "unweighted_occurrences",
]);
export type ActivityPlanProjectionWeightingBasis = z.infer<
  typeof activityPlanProjectionWeightingBasisSchema
>;

const finiteNonnegative = z.number().finite().nonnegative();
export const activityPlanProjectionCoverageSchema = z.strictObject({
  contributors: z.strictObject({
    contributing: z.number().int().nonnegative(),
    laneTotal: z.number().int().nonnegative(),
    planTotal: z.number().int().nonnegative(),
  }),
  weight: z.strictObject({
    covered: finiteNonnegative,
    total: finiteNonnegative,
  }),
});
export type ActivityPlanProjectionCoverage = z.infer<typeof activityPlanProjectionCoverageSchema>;

export const activityPlanObjectiveIntensityUnavailableReasonSchema = z.enum([
  "no_activity_occurrences",
  "no_objective_targets",
  "ambiguous_objective_targets",
  "calibration_required",
  "incomplete_objective_coverage",
  "mixed_completion_bases",
  "open_completion",
  "invalid_weight",
]);
export type ActivityPlanObjectiveIntensityUnavailableReason = z.infer<
  typeof activityPlanObjectiveIntensityUnavailableReasonSchema
>;

const objectiveIntensityProjectionShape = {
  unit: z.literal("ratio"),
  basis: z.literal("compiled_occurrences"),
  contributorCoverage: z.strictObject({
    contributing: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
};

/** Strict generic plan intensity: one complete ratio or an explicit unavailable result. */
export const activityPlanObjectiveIntensityProjectionSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...objectiveIntensityProjectionShape,
      status: z.literal("available"),
      value: z.number().finite().nonnegative(),
      reason: z.null(),
      completionPolicy: activityPlanCompletionPolicySchema.exclude(["untilFinished"]),
      weightingBasis: activityPlanProjectionWeightingBasisSchema.exclude([
        "unweighted_occurrences",
      ]),
      provenance: z.enum(["plan_intent", "personalized", "mixed"]),
    }),
    z.strictObject({
      ...objectiveIntensityProjectionShape,
      status: z.literal("unavailable"),
      value: z.null(),
      reason: activityPlanObjectiveIntensityUnavailableReasonSchema,
      completionPolicy: z.null(),
      weightingBasis: z.null(),
      provenance: z.null(),
    }),
  ])
  .superRefine((projection, context) => {
    if (projection.contributorCoverage.contributing > projection.contributorCoverage.total) {
      context.addIssue({
        code: "custom",
        path: ["contributorCoverage"],
        message: "Objective-intensity contributors cannot exceed plan occurrences",
      });
    }
    if (
      projection.status === "available" &&
      (projection.contributorCoverage.total === 0 ||
        projection.contributorCoverage.contributing !== projection.contributorCoverage.total)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Available objective intensity requires complete objective-target coverage",
      });
    }
  });
export type ActivityPlanObjectiveIntensityProjection = z.infer<
  typeof activityPlanObjectiveIntensityProjectionSchema
>;

const distanceProjectionShape = {
  nativeMetric: z.literal("distance"),
  unit: z.literal("meters"),
  scope: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("full_plan"),
      completionPolicy: activityPlanCompletionPolicySchema.nullable(),
    }),
    z.strictObject({
      kind: z.literal("completion_lane"),
      completionPolicy: activityPlanCompletionPolicySchema,
    }),
  ]),
  weightingBasis: z.literal("distance_meters"),
  coverage: activityPlanProjectionCoverageSchema,
  provenance: z.enum(["authored", "derived", "mixed"]),
  basis: z.literal("compiled_occurrences"),
};

export const activityPlanDistanceProjectionSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...distanceProjectionShape,
      status: z.literal("complete"),
      value: finiteNonnegative,
      reason: z.null(),
    }),
    z.strictObject({
      ...distanceProjectionShape,
      status: z.literal("partial"),
      value: finiteNonnegative,
      reason: z.enum(["lane_scope", "incomplete_contributors", "mixed_completion_lanes"]),
    }),
    z.strictObject({
      ...distanceProjectionShape,
      status: z.literal("unavailable"),
      value: z.null(),
      reason: z.enum(["not_prescribed", "open_completion", "invalid_data"]),
    }),
  ])
  .superRefine((value, context) => {
    const { contributors, weight } = value.coverage;
    if (
      contributors.contributing > contributors.laneTotal ||
      contributors.laneTotal > contributors.planTotal ||
      weight.covered > weight.total
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverage"],
        message: "Invalid distance coverage",
      });
    }
    if (
      value.status === "complete" &&
      (value.scope.kind !== "full_plan" || contributors.contributing !== contributors.planTotal)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "A complete distance projection must cover the full plan",
      });
    }
  });
export type ActivityPlanDistanceProjection = z.infer<typeof activityPlanDistanceProjectionSchema>;

export const activityPlanOccurrenceProjectionInputSchema = z
  .strictObject({
    occurrenceId: z.string().trim().min(1).max(512),
    completionPolicy: activityPlanCompletionPolicySchema,
    weight: finiteNonnegative.nullable(),
    objectiveIntensity: z.discriminatedUnion("status", [
      z.strictObject({
        status: z.literal("available"),
        value: z.number().finite().nonnegative(),
        source: z.enum(["direct_relative", "athlete_calibrated"]),
      }),
      z.strictObject({
        status: z.literal("unavailable"),
        value: z.null(),
        reason: z.enum([
          "no_objective_target",
          "ambiguous_objective_targets",
          "calibration_required",
        ]),
      }),
    ]),
    distance: z
      .strictObject({
        value: finiteNonnegative,
        provenance: z.enum(["authored", "derived"]),
      })
      .nullable(),
  })
  .superRefine((value, context) => {
    if ((value.completionPolicy === "untilFinished") !== (value.weight === null)) {
      context.addIssue({
        code: "custom",
        path: ["weight"],
        message: "Only open completion has no quantifiable lane weight",
      });
    }
  });
export type ActivityPlanOccurrenceProjectionInput = z.infer<
  typeof activityPlanOccurrenceProjectionInputSchema
>;

export const activityPlanProjectionSchema = z
  .strictObject({
    contractVersion: z.literal("activity-plan-projection-v1"),
    revisionFingerprint: z.string().trim().min(1).max(256),
    occurrences: z
      .array(
        z.strictObject({
          occurrenceId: z.string().trim().min(1).max(512),
          completionPolicy: activityPlanCompletionPolicySchema,
          weightingBasis: activityPlanProjectionWeightingBasisSchema.nullable(),
          weight: finiteNonnegative.nullable(),
        }),
      )
      .max(10_000),
    distance: activityPlanDistanceProjectionSchema,
    objectiveIntensity: activityPlanObjectiveIntensityProjectionSchema,
  })
  .superRefine((projection, context) => {
    const occurrenceIds = new Set<string>();
    for (const [index, occurrence] of projection.occurrences.entries()) {
      if (occurrenceIds.has(occurrence.occurrenceId)) {
        context.addIssue({
          code: "custom",
          path: ["occurrences", index, "occurrenceId"],
          message: "Plan projection occurrence IDs must be unique",
        });
      }
      occurrenceIds.add(occurrence.occurrenceId);
      const expected = weightingBasis(occurrence.completionPolicy);
      if (occurrence.weightingBasis !== expected) {
        context.addIssue({
          code: "custom",
          path: ["occurrences", index, "weightingBasis"],
          message: "Occurrence weighting must match its completion policy",
        });
      }
      if ((occurrence.completionPolicy === "untilFinished") !== (occurrence.weight === null)) {
        context.addIssue({
          code: "custom",
          path: ["occurrences", index, "weight"],
          message: "Only open completion has no quantifiable occurrence weight",
        });
      }
    }
    const distanceScope = projection.distance.scope;
    const scopedOccurrenceCount =
      distanceScope.kind === "full_plan"
        ? projection.occurrences.length
        : projection.occurrences.filter(
            (occurrence) => occurrence.completionPolicy === distanceScope.completionPolicy,
          ).length;
    if (projection.distance.coverage.contributors.laneTotal !== scopedOccurrenceCount) {
      context.addIssue({
        code: "custom",
        path: ["distance", "coverage", "contributors", "laneTotal"],
        message: "Distance contributor coverage must match its represented scope",
      });
    }
    if (distanceScope.kind === "completion_lane" && scopedOccurrenceCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["distance", "scope", "completionPolicy"],
        message: "Distance completion-lane scope must reference an actual occurrence lane",
      });
    }
  });
export type ActivityPlanProjection = z.infer<typeof activityPlanProjectionSchema>;

function weightingBasis(
  policy: ActivityPlanCompletionPolicy,
): ActivityPlanProjectionWeightingBasis {
  if (policy === "time") return "duration_seconds";
  if (policy === "distance") return "distance_meters";
  if (policy === "repetitions") return "repetition_count";
  return "unweighted_occurrences";
}

function unavailableObjectiveIntensity(input: {
  contributing: number;
  reason: ActivityPlanObjectiveIntensityUnavailableReason;
  total: number;
}): ActivityPlanObjectiveIntensityProjection {
  return activityPlanObjectiveIntensityProjectionSchema.parse({
    status: "unavailable",
    value: null,
    unit: "ratio",
    reason: input.reason,
    completionPolicy: null,
    weightingBasis: null,
    contributorCoverage: { contributing: input.contributing, total: input.total },
    provenance: null,
    basis: "compiled_occurrences",
  });
}

function projectObjectiveIntensity(
  occurrences: readonly ActivityPlanOccurrenceProjectionInput[],
): ActivityPlanObjectiveIntensityProjection {
  const total = occurrences.length;
  if (total === 0) {
    return unavailableObjectiveIntensity({
      contributing: 0,
      reason: "no_activity_occurrences",
      total,
    });
  }
  const available = occurrences.filter(
    (occurrence) => occurrence.objectiveIntensity.status === "available",
  );
  const policies = new Set(occurrences.map((occurrence) => occurrence.completionPolicy));
  if (policies.size !== 1) {
    return unavailableObjectiveIntensity({
      contributing: available.length,
      reason: "mixed_completion_bases",
      total,
    });
  }
  const policy = occurrences[0]?.completionPolicy;
  if (!policy || policy === "untilFinished") {
    return unavailableObjectiveIntensity({
      contributing: available.length,
      reason: "open_completion",
      total,
    });
  }
  if (available.length !== total) {
    const unavailableReasons = occurrences.flatMap((occurrence) =>
      occurrence.objectiveIntensity.status === "unavailable"
        ? [occurrence.objectiveIntensity.reason]
        : [],
    );
    const reason: ActivityPlanObjectiveIntensityUnavailableReason = unavailableReasons.includes(
      "ambiguous_objective_targets",
    )
      ? "ambiguous_objective_targets"
      : unavailableReasons.includes("calibration_required")
        ? "calibration_required"
        : available.length === 0 &&
            unavailableReasons.every((value) => value === "no_objective_target")
          ? "no_objective_targets"
          : "incomplete_objective_coverage";
    return unavailableObjectiveIntensity({ contributing: available.length, reason, total });
  }
  const totalWeight = occurrences.reduce((sum, occurrence) => sum + (occurrence.weight ?? 0), 0);
  if (
    totalWeight <= 0 ||
    occurrences.some(
      (occurrence) =>
        occurrence.weight === null || !Number.isFinite(occurrence.weight) || occurrence.weight <= 0,
    )
  ) {
    return unavailableObjectiveIntensity({
      contributing: available.length,
      reason: "invalid_weight",
      total,
    });
  }
  const weightedValue = occurrences.reduce(
    (sum, occurrence) =>
      sum +
      (occurrence.objectiveIntensity.status === "available"
        ? occurrence.objectiveIntensity.value * (occurrence.weight ?? 0)
        : 0),
    0,
  );
  const sources = new Set(
    available.map((occurrence) =>
      occurrence.objectiveIntensity.status === "available"
        ? occurrence.objectiveIntensity.source
        : "direct_relative",
    ),
  );
  return activityPlanObjectiveIntensityProjectionSchema.parse({
    status: "available",
    value: weightedValue / totalWeight,
    unit: "ratio",
    reason: null,
    completionPolicy: policy,
    weightingBasis: weightingBasis(policy),
    contributorCoverage: { contributing: total, total },
    provenance:
      sources.size > 1
        ? "mixed"
        : sources.has("athlete_calibrated")
          ? "personalized"
          : "plan_intent",
    basis: "compiled_occurrences",
  });
}

/** Builds authored projection quantities while compiled completion semantics are still explicit. */
export function createActivityPlanProjection(input: {
  revisionFingerprint: string;
  occurrences: readonly ActivityPlanOccurrenceProjectionInput[];
}): ActivityPlanProjection {
  if (input.occurrences.length > 10_000) {
    throw new Error("Activity plan projection cannot exceed 10,000 compiled occurrences");
  }
  const occurrences = input.occurrences.map((occurrence) =>
    activityPlanOccurrenceProjectionInputSchema.parse(occurrence),
  );
  const policies = new Set(occurrences.map((occurrence) => occurrence.completionPolicy));

  const allDistanceContributors = occurrences.filter((occurrence) => occurrence.distance !== null);
  const distanceLane = occurrences.filter(
    (occurrence) => occurrence.completionPolicy === "distance",
  );
  // A mixed plan's distance quantity describes the authored distance lane. Derived
  // distance from another completion lane is not promoted into a full-plan total.
  const distanceContributors =
    policies.size > 1 && distanceLane.length > 0
      ? distanceLane.filter((occurrence) => occurrence.distance !== null)
      : allDistanceContributors;
  const distanceContributorPolicies = new Set(
    distanceContributors.map((occurrence) => occurrence.completionPolicy),
  );
  const singleContributorPolicy =
    distanceContributorPolicies.size === 1
      ? (distanceContributorPolicies.values().next().value ?? null)
      : null;
  const distanceValue = distanceContributors.reduce(
    (sum, occurrence) => sum + (occurrence.distance?.value ?? 0),
    0,
  );
  const distanceScope: z.infer<(typeof distanceProjectionShape)["scope"]> =
    policies.size === 1
      ? { kind: "full_plan", completionPolicy: occurrences[0]?.completionPolicy ?? null }
      : distanceLane.length > 0
        ? { kind: "completion_lane", completionPolicy: "distance" }
        : singleContributorPolicy !== null
          ? { kind: "completion_lane", completionPolicy: singleContributorPolicy }
          : { kind: "full_plan", completionPolicy: null };
  const scopedOccurrences =
    distanceScope.kind === "full_plan"
      ? occurrences
      : occurrences.filter(
          (occurrence) => occurrence.completionPolicy === distanceScope.completionPolicy,
        );
  const completeDistance =
    distanceContributors.length === occurrences.length && policies.size === 1;
  const mixedDerivedLanes =
    policies.size > 1 && distanceLane.length === 0 && distanceContributorPolicies.size > 1;
  const distanceCoverage = {
    contributors: {
      contributing: distanceContributors.length,
      laneTotal: scopedOccurrences.length,
      planTotal: occurrences.length,
    },
    weight: {
      covered: distanceValue,
      total:
        distanceScope.kind === "completion_lane" && distanceScope.completionPolicy === "distance"
          ? scopedOccurrences.reduce((sum, value) => sum + (value.weight ?? 0), 0)
          : distanceValue,
    },
  };
  const distance =
    distanceContributors.length === 0
      ? activityPlanDistanceProjectionSchema.parse({
          status: "unavailable",
          value: null,
          reason: policies.has("untilFinished") ? "open_completion" : "not_prescribed",
          nativeMetric: "distance",
          unit: "meters",
          scope: distanceScope,
          weightingBasis: "distance_meters",
          coverage: distanceCoverage,
          provenance: "authored",
          basis: "compiled_occurrences",
        })
      : activityPlanDistanceProjectionSchema.parse({
          status: completeDistance ? "complete" : "partial",
          value: distanceValue,
          reason: completeDistance
            ? null
            : distanceScope.kind === "completion_lane"
              ? "lane_scope"
              : mixedDerivedLanes
                ? "mixed_completion_lanes"
                : "incomplete_contributors",
          nativeMetric: "distance",
          unit: "meters",
          scope: distanceScope,
          weightingBasis: "distance_meters",
          coverage: distanceCoverage,
          provenance: distanceContributors.every(
            (occurrence) => occurrence.distance?.provenance === "authored",
          )
            ? "authored"
            : distanceContributors.every(
                  (occurrence) => occurrence.distance?.provenance === "derived",
                )
              ? "derived"
              : "mixed",
          basis: "compiled_occurrences",
        });

  return activityPlanProjectionSchema.parse({
    contractVersion: "activity-plan-projection-v1",
    revisionFingerprint: input.revisionFingerprint,
    occurrences: occurrences.map((occurrence) => ({
      occurrenceId: occurrence.occurrenceId,
      completionPolicy: occurrence.completionPolicy,
      weightingBasis: weightingBasis(occurrence.completionPolicy),
      weight: occurrence.weight,
    })),
    distance,
    objectiveIntensity: projectObjectiveIntensity(occurrences),
  });
}
